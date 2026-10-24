import { supabase } from "@/lib/supabase";

/**
 * Um canal do Supabase por tópico, dividido entre quem o escuta.
 *
 * `supabase.channel(topic)` devolve o canal que já existe para o mesmo tópico,
 * e a tela do pedido abre três ouvintes no mesmo: acompanhamento, chat e mapa
 * do motoboy. Cada um fazia `removeChannel` ao desmontar, e o primeiro a sair
 * (fechar o chat, o mapa sumir quando o pedido é entregue) derrubava o canal
 * dos outros dois em silêncio. Aqui o canal só fecha quando o último ouvinte
 * sai.
 *
 * A reconexão também mora aqui, uma vez por canal: com ela em cada ouvinte,
 * três reaberturas simultâneas do mesmo tópico brigavam entre si.
 */

export type StatusDoCanal = "conectando" | "conectado" | "caiu";

type Tratador = (payload: Record<string, unknown>) => void;

export interface Ouvinte {
  /** Lido a cada mensagem: trocar a função não reabre nada. */
  tratadores: () => Record<string, Tratador>;
  aoMudarStatus?: (status: StatusDoCanal) => void;
}

interface Entrada {
  topic: string;
  canal: ReturnType<typeof supabase.channel> | null;
  eventos: Set<string>;
  ouvintes: Set<Ouvinte>;
  status: StatusDoCanal;
  tentativas: number;
  timer: ReturnType<typeof setTimeout> | undefined;
}

const entradas = new Map<string, Entrada>();

/**
 * Espera antes da tentativa `n` (0, 1, 2…): 2s, 4s, 8s… até 60s.
 *
 * Sem teto, uma cozinha que ficou uma hora sem rede passaria o resto do turno
 * esperando minutos entre tentativas; sem crescer, um servidor fora do ar
 * levaria uma chamada a cada 2s de cada tablet aberto.
 */
export function esperaDaTentativa(n: number): number {
  return Math.min(2_000 * 2 ** n, 60_000);
}

function mudarStatus(entrada: Entrada, status: StatusDoCanal) {
  entrada.status = status;
  for (const o of entrada.ouvintes) o.aoMudarStatus?.(status);
}

function ligarEvento(entrada: Entrada, evento: string) {
  entrada.canal?.on("broadcast", { event: evento }, ({ payload }) => {
    const dado = (payload ?? {}) as Record<string, unknown>;
    for (const o of entrada.ouvintes) o.tratadores()[evento]?.(dado);
  });
}

/**
 * O removeChannel só tira o canal da lista do cliente quando o servidor
 * confirma a saída. Até lá, `supabase.channel(topic)` devolveria o mesmo canal
 * que está saindo, e assinar de novo nele não entra em lugar nenhum. Por isso
 * quem reabre espera a saída anterior terminar.
 */
const fechando = new Map<string, Promise<unknown>>();

function abrir(entrada: Entrada) {
  const pendente = fechando.get(entrada.topic);
  if (pendente) {
    pendente.then(() => {
      if (entradas.get(entrada.topic) === entrada && !entrada.canal) abrirAgora(entrada);
    });
    return;
  }
  abrirAgora(entrada);
}

function abrirAgora(entrada: Entrada) {
  const canal = supabase.channel(entrada.topic);
  entrada.canal = canal;
  for (const evento of entrada.eventos) ligarEvento(entrada, evento);
  canal.subscribe((status: string) => {
    // Canal que já trocamos por outro, ou que fechamos de propósito: o CLOSED
    // dele é a gente saindo, não o canal caindo.
    if (entrada.canal !== canal) return;
    if (status === "SUBSCRIBED") {
      entrada.tentativas = 0;
      clearTimeout(entrada.timer);
      mudarStatus(entrada, "conectado");
      return;
    }
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      mudarStatus(entrada, "caiu");
      // A biblioteca tenta reentrar sozinha depois de erro, mas não depois de
      // CLOSED vindo do servidor. Reabrir do zero cobre os dois: se ela já
      // tiver voltado quando o timer vencer, o SUBSCRIBED cancela o timer.
      clearTimeout(entrada.timer);
      entrada.timer = setTimeout(() => reabrirCanal(entrada.topic), esperaDaTentativa(entrada.tentativas++));
    }
  });
}

function fechar(entrada: Entrada) {
  clearTimeout(entrada.timer);
  const canal = entrada.canal;
  entrada.canal = null;
  if (!canal) return;
  const saida: Promise<unknown> = Promise.resolve(supabase.removeChannel(canal))
    .catch(() => {})
    .finally(() => {
      if (fechando.get(entrada.topic) === saida) fechando.delete(entrada.topic);
    });
  fechando.set(entrada.topic, saida);
}

/**
 * Entra no canal do tópico, abrindo-o se for o primeiro ouvinte. Devolve a
 * função de saída; o canal fecha quando o último sai.
 *
 * Quem chega com o canal já de pé recebe o status atual na hora: o subscribe
 * de um canal já assinado não chama callback nenhum, e sem isso o segundo
 * ouvinte ficaria em "conectando" para sempre.
 */
export function entrarNoCanal(topic: string, eventos: string[], ouvinte: Ouvinte): () => void {
  let entrada = entradas.get(topic);
  const nova = !entrada;
  if (!entrada) {
    entrada = {
      topic,
      canal: null,
      eventos: new Set(),
      ouvintes: new Set(),
      status: "conectando",
      tentativas: 0,
      timer: undefined,
    };
    entradas.set(topic, entrada);
  }
  entrada.ouvintes.add(ouvinte);
  for (const evento of eventos) {
    if (entrada.eventos.has(evento)) continue;
    entrada.eventos.add(evento);
    // Broadcast é filtrado no cliente: ligar um evento num canal já assinado
    // passa a valer na próxima mensagem, sem reassinar.
    if (!nova) ligarEvento(entrada, evento);
  }
  if (nova) abrir(entrada);
  else ouvinte.aoMudarStatus?.(entrada.status);

  const e = entrada;
  return () => {
    e.ouvintes.delete(ouvinte);
    if (e.ouvintes.size > 0) return;
    fechar(e);
    entradas.delete(topic);
  };
}

/** Fecha e reabre o canal do tópico, mantendo os ouvintes. Usado ao voltar a rede. */
export function reabrirCanal(topic: string, zerarTentativas = false): void {
  const entrada = entradas.get(topic);
  if (!entrada) return;
  if (zerarTentativas) entrada.tentativas = 0;
  fechar(entrada);
  mudarStatus(entrada, "conectando");
  abrir(entrada);
}

/** Só para teste: esquece todos os canais. */
export function _esquecerCanais(): void {
  for (const e of entradas.values()) clearTimeout(e.timer);
  entradas.clear();
  fechando.clear();
}
