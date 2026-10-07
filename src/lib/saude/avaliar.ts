import type { NivelEvento } from "@prisma/client";
import { LIMIARES } from "./limiares";
import { classificarOrigem, ORIGEM_DO_PROVISIONAMENTO, type ChavePeca } from "./origens";
import { tempoDesde } from "./tempo";

/**
 * A regra da saúde, sem banco: recebe o que coletar.ts leu e devolve as
 * peças coloridas. A tela e a rota do monitor chamam esta mesma função, então
 * se uma diz vermelho a outra diz 503.
 *
 * Os limiares moram em LIMIARES. As janelas de 1 h e 24 h escritas aqui não
 * são limiar: são as janelas fixas de leitura das regras ("na última hora",
 * "nas últimas 24 h"), que a própria mensagem de cada peça cita.
 */
export type Cor = "verde" | "amarelo" | "vermelho" | "neutro";
export type Peca = { chave: ChavePeca; nome: string; cor: Cor; motivo: string; ultimoSinal: Date | null };
export type Saude = { geral: Cor; resumo: string; pecas: Peca[] };
export type EventoResumido = { origem: string; nivel: NivelEvento; criadoEm: Date };
export type LeituraDeSaude = {
  eventos: EventoResumido[];
  ultimoCron: EventoResumido | null;
  primeiroEvento: Date | null;
  inscricoesPagas: { total: number; maisAntiga: Date | null };
  pedidos: { naUltimaHora: number; mesmaHoraAntes: number[]; ultimoPedido: Date | null };
};
export type DadosDeSaude = { banco: { ok: boolean; ms: number }; leitura: LeituraDeSaude | null };

const NOMES: Record<ChavePeca, string> = {
  banco: "Banco",
  cron: "Cron diário",
  "webhook-asaas": "Webhook do Asaas",
  provisionamento: "Provisionamento",
  pagamentos: "Pagamentos dos restaurantes",
  email: "E-mail",
  rotas: "Erros de rota",
  pedidos: "Pedidos",
};
const ORDEM: ChavePeca[] = ["banco", "cron", "webhook-asaas", "provisionamento", "pagamentos", "email", "rotas", "pedidos"];
const GRAVIDADE: Record<Cor, number> = { neutro: -1, verde: 0, amarelo: 1, vermelho: 2 };

const H = 3_600_000;
const MIN = 60_000;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function avaliarSaude(dados: DadosDeSaude, agora: Date): Saude {
  const desde = (d: Date) => agora.getTime() - d.getTime();
  const peca = (chave: ChavePeca, cor: Cor, motivo: string, ultimoSinal: Date | null = null): Peca => ({
    chave,
    nome: NOMES[chave],
    cor,
    motivo,
    ultimoSinal,
  });

  const banco = !dados.banco.ok
    ? peca("banco", "vermelho", "o banco não respondeu")
    : dados.banco.ms > LIMIARES.bancoLentoMs
      ? peca("banco", "amarelo", `respondendo devagar (${dados.banco.ms} ms)`, agora)
      : peca("banco", "verde", `respondeu em ${dados.banco.ms} ms`, agora);

  const l = dados.leitura;
  if (!l) {
    const resto = ORDEM.slice(1).map((c) => peca(c, "neutro", "sem leitura: o banco não respondeu"));
    return fechar([banco, ...resto]);
  }

  // Mais recente primeiro, independente da ordem em que vieram.
  const eventos = [...l.eventos].sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime());
  const da = (chave: ChavePeca) => eventos.filter((e) => classificarOrigem(e.origem) === chave);
  const erros = (lista: EventoResumido[], janelaMs: number) =>
    lista.filter((e) => e.nivel === "ERRO" && desde(e.criadoEm) <= janelaMs).length;
  const ultimoOk = (lista: EventoResumido[]) => lista.find((e) => e.nivel === "OK")?.criadoEm ?? null;

  return fechar([
    banco,
    avaliarCron(l, da("cron")),
    avaliarWebhookAsaas(da("webhook-asaas")),
    avaliarProvisionamento(l),
    avaliarPorErros("pagamentos", da("pagamentos"), LIMIARES.pagamentosVermelhoNaHora),
    avaliarPorErros("email", da("email"), LIMIARES.emailVermelhoNaHora),
    avaliarRotas(da("rotas")),
    avaliarPedidos(l.pedidos),
  ]);

  function avaliarCron(leitura: LeituraDeSaude, doCron: EventoResumido[]): Peca {
    const sinal = leitura.ultimoCron;
    if (!sinal) {
      // Primeiro deploy: a tabela é nova e o cron ainda não rodou. Gritar
      // vermelho a noite inteira ensinaria a ignorar o alarme no dia um.
      const tabelaNova = !leitura.primeiroEvento || desde(leitura.primeiroEvento) <= LIMIARES.cronVermelhoH * H;
      return tabelaNova
        ? peca("cron", "amarelo", "aguardando a primeira execução registrada")
        : peca("cron", "vermelho", "nenhuma execução registrada");
    }
    const quando = tempoDesde(sinal.criadoEm, agora);
    const horas = desde(sinal.criadoEm) / H;
    if (horas > LIMIARES.cronVermelhoH) return peca("cron", "vermelho", `sem rodar, última execução ${quando}`, sinal.criadoEm);
    if (horas > LIMIARES.cronAmareloH) return peca("cron", "amarelo", `atrasado, última execução ${quando}`, sinal.criadoEm);
    if (sinal.nivel === "AVISO") return peca("cron", "amarelo", `rodou ${quando} com etapa em erro`, sinal.criadoEm);
    // Erro depois do sinal é execução que morreu antes de terminar: as etapas
    // erram DURANTE a execução, e o sinal é gravado no fim.
    const morreu = doCron.some((e) => e.nivel === "ERRO" && e.criadoEm > sinal.criadoEm);
    if (morreu) return peca("cron", "amarelo", "falhou depois da última execução completa", sinal.criadoEm);
    return peca("cron", "verde", `rodou ${quando}`, sinal.criadoEm);
  }

  function avaliarWebhookAsaas(lista: EventoResumido[]): Peca {
    const sinal = ultimoOk(lista);
    // Dia sem webhook é normal quando ninguém pagou: ausência não é falha aqui.
    if (lista.length === 0) return peca("webhook-asaas", "verde", `sem eventos nas últimas ${LIMIARES.janelaDeEventosH} h`);
    if (lista[0].nivel === "ERRO") {
      return peca("webhook-asaas", "vermelho", `o último evento falhou (${tempoDesde(lista[0].criadoEm, agora)})`, sinal);
    }
    const n = erros(lista, 24 * H);
    if (n > 0) return peca("webhook-asaas", "amarelo", `${plural(n, "erro", "erros")} nas últimas 24 h`, sinal);
    return peca("webhook-asaas", "verde", sinal ? `último evento ${tempoDesde(sinal, agora)}` : "sem falhas", sinal);
  }

  function avaliarProvisionamento(leitura: LeituraDeSaude): Peca {
    const sinal = eventos.find((e) => e.origem === ORIGEM_DO_PROVISIONAMENTO && e.nivel === "OK")?.criadoEm ?? null;
    const { total, maisAntiga } = leitura.inscricoesPagas;
    if (total === 0 || !maisAntiga) return peca("provisionamento", "verde", "nenhum pagamento esperando restaurante", sinal);
    const minutos = desde(maisAntiga) / MIN;
    const motivo = `${plural(total, "pagamento", "pagamentos")} sem restaurante, o mais antigo ${tempoDesde(maisAntiga, agora)}`;
    if (minutos > LIMIARES.provisionamentoVermelhoMin) return peca("provisionamento", "vermelho", motivo, sinal);
    if (minutos > LIMIARES.provisionamentoAmareloMin) return peca("provisionamento", "amarelo", motivo, sinal);
    return peca("provisionamento", "verde", "provisionando", sinal);
  }

  function avaliarPorErros(chave: "pagamentos" | "email", lista: EventoResumido[], vermelhoNaHora: number): Peca {
    const sinal = ultimoOk(lista);
    const naHora = erros(lista, H);
    const noDia = erros(lista, 24 * H);
    if (naHora >= vermelhoNaHora) return peca(chave, "vermelho", `${plural(naHora, "erro", "erros")} na última hora`, sinal);
    if (noDia > 0) return peca(chave, "amarelo", `${plural(noDia, "erro", "erros")} nas últimas 24 h`, sinal);
    return peca(chave, "verde", "nenhuma falha nas últimas 24 h", sinal);
  }

  function avaliarRotas(lista: EventoResumido[]): Peca {
    const naHora = erros(lista, H);
    const ultimo = lista.find((e) => e.nivel === "ERRO")?.criadoEm ?? null;
    if (naHora >= LIMIARES.rotasVermelhoNaHora) return peca("rotas", "vermelho", `${naHora} erros na última hora`, ultimo);
    if (naHora >= LIMIARES.rotasAmareloNaHora) return peca("rotas", "amarelo", `${plural(naHora, "erro", "erros")} na última hora`, ultimo);
    return peca("rotas", "verde", "nenhum erro na última hora", ultimo);
  }

  function avaliarPedidos(p: LeituraDeSaude["pedidos"]): Peca {
    const media = p.mesmaHoraAntes.length
      ? p.mesmaHoraAntes.reduce((a, b) => a + b, 0) / p.mesmaHoraAntes.length
      : 0;
    const agoraTexto = `${plural(p.naUltimaHora, "pedido", "pedidos")} na última hora`;
    // Nunca vermelho: queda de volume tem causa inocente (feriado, chuva), e
    // vermelho por motivo inocente ensina a ignorar o alarme.
    if (media < LIMIARES.pedidosMediaMinima) return peca("pedidos", "neutro", agoraTexto, p.ultimoPedido);
    const normal = Math.round(media);
    if (p.naUltimaHora === 0) {
      return peca("pedidos", "amarelo", `nenhum pedido na última hora, o normal seria perto de ${normal}`, p.ultimoPedido);
    }
    return peca("pedidos", "verde", `${agoraTexto}, o normal é perto de ${normal}`, p.ultimoPedido);
  }
}

function fechar(pecas: Peca[]): Saude {
  const pior = pecas.reduce<Cor>((acc, p) => (GRAVIDADE[p.cor] > GRAVIDADE[acc] ? p.cor : acc), "neutro");
  if (pior === "verde" || pior === "neutro") return { geral: pior, resumo: "Tudo funcionando", pecas };
  const problemas = pecas
    .filter((p) => p.cor === "vermelho" || p.cor === "amarelo")
    .sort((a, b) => GRAVIDADE[b.cor] - GRAVIDADE[a.cor]);
  const [primeira] = problemas;
  const mais = problemas.length > 1 ? ` (e mais ${problemas.length - 1})` : "";
  return { geral: pior, resumo: `${primeira.nome}: ${primeira.motivo}${mais}`, pecas };
}
