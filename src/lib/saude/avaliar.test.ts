import { describe, expect, it } from "vitest";
import { avaliarSaude, type DadosDeSaude, type EventoResumido, type LeituraDeSaude } from "./avaliar";
import type { ChavePeca } from "./origens";

const AGORA = new Date("2026-10-10T23:00:00Z"); // sábado, 20h em Brasília
const H = 3_600_000;
const MIN = 60_000;
const ha = (ms: number) => new Date(AGORA.getTime() - ms);
const ev = (origem: string, nivel: EventoResumido["nivel"], msAtras: number): EventoResumido => ({
  origem,
  nivel,
  criadoEm: ha(msAtras),
});

function leitura(parcial: Partial<LeituraDeSaude> = {}): LeituraDeSaude {
  return {
    eventos: [],
    ultimoCron: ev("cron/assinaturas", "OK", 10 * H),
    primeiroEvento: ha(10 * 24 * H),
    inscricoesPagas: { total: 0, maisAntiga: null },
    pedidos: { naUltimaHora: 12, mesmaHoraAntes: [10, 11, 9, 12], ultimoPedido: ha(2 * MIN) },
    ...parcial,
  };
}
const dados = (parcial: Partial<LeituraDeSaude> = {}, banco = { ok: true, ms: 20 }): DadosDeSaude => ({
  banco,
  leitura: leitura(parcial),
});
const peca = (d: DadosDeSaude, chave: ChavePeca) => avaliarSaude(d, AGORA).pecas.find((p) => p.chave === chave)!;

describe("avaliarSaude: estado geral", () => {
  it("tudo verde diz que está tudo funcionando", () => {
    const s = avaliarSaude(dados(), AGORA);
    expect(s.geral).toBe("verde");
    expect(s.resumo).toBe("Tudo funcionando");
    expect(s.pecas.map((p) => p.chave)).toEqual([
      "banco", "cron", "webhook-asaas", "provisionamento", "pagamentos", "email", "rotas", "pedidos",
    ]);
  });

  it("geral é a pior cor, e o resumo cita a peça e quantas mais", () => {
    const s = avaliarSaude(
      dados({
        inscricoesPagas: { total: 1, maisAntiga: ha(2 * H) },
        eventos: [ev("route:/api/orders/[id]", "ERRO", 5 * MIN)],
      }),
      AGORA
    );
    expect(s.geral).toBe("vermelho");
    expect(s.resumo).toMatch(/^Provisionamento: /);
    expect(s.resumo).toMatch(/\(e mais 1\)$/);
  });

  it("neutro não conta para o geral", () => {
    const s = avaliarSaude(dados({ pedidos: { naUltimaHora: 0, mesmaHoraAntes: [0, 1, 0, 0], ultimoPedido: null } }), AGORA);
    expect(peca(dados({ pedidos: { naUltimaHora: 0, mesmaHoraAntes: [0, 1, 0, 0], ultimoPedido: null } }), "pedidos").cor).toBe("neutro");
    expect(s.geral).toBe("verde");
  });
});

describe("banco", () => {
  it("fora do ar: banco vermelho e as outras peças neutras", () => {
    const s = avaliarSaude({ banco: { ok: false, ms: 3000 }, leitura: null }, AGORA);
    expect(s.geral).toBe("vermelho");
    expect(s.pecas[0]).toMatchObject({ chave: "banco", cor: "vermelho" });
    expect(s.pecas.slice(1).every((p) => p.cor === "neutro")).toBe(true);
  });
  it("lento é amarelo", () => {
    expect(peca(dados({}, { ok: true, ms: 501 }), "banco").cor).toBe("amarelo");
    expect(peca(dados({}, { ok: true, ms: 500 }), "banco").cor).toBe("verde");
  });
});

describe("cron", () => {
  it.each([
    [25 * H, "verde"],
    [27 * H, "amarelo"],
    [49 * H, "amarelo"],
    [51 * H, "vermelho"],
  ])("último sinal há %i ms é %s", (ms, cor) => {
    expect(peca(dados({ ultimoCron: ev("cron/assinaturas", "OK", ms) }), "cron").cor).toBe(cor);
  });

  it("rodou com etapa em erro (AVISO) é amarelo", () => {
    expect(peca(dados({ ultimoCron: ev("cron/assinaturas", "AVISO", H) }), "cron").cor).toBe("amarelo");
  });

  it("erro do cron depois do último sinal (morreu no meio) é amarelo", () => {
    const d = dados({ ultimoCron: ev("cron/assinaturas", "OK", 20 * H), eventos: [ev("route:/api/cron/assinaturas", "ERRO", H)] });
    expect(peca(d, "cron").cor).toBe("amarelo");
  });

  it("erro de etapa ANTES do sinal não pesa: o sinal já veio como AVISO ou OK", () => {
    const d = dados({ ultimoCron: ev("cron/assinaturas", "OK", H), eventos: [ev("cron/assinaturas:faxina", "ERRO", H + MIN)] });
    expect(peca(d, "cron").cor).toBe("verde");
  });

  it("sem sinal nenhum, com a tabela nova (primeiro deploy), é amarelo", () => {
    const d = dados({ ultimoCron: null, primeiroEvento: ha(3 * H) });
    expect(peca(d, "cron")).toMatchObject({ cor: "amarelo", motivo: "aguardando a primeira execução registrada" });
    expect(peca(dados({ ultimoCron: null, primeiroEvento: null }), "cron").cor).toBe("amarelo");
  });

  it("sem sinal nenhum, com a tabela antiga, é vermelho", () => {
    expect(peca(dados({ ultimoCron: null, primeiroEvento: ha(51 * H) }), "cron").cor).toBe("vermelho");
  });
});

describe("webhook do Asaas", () => {
  it("sem evento é verde: dia sem pagamento é normal", () => {
    expect(peca(dados(), "webhook-asaas").cor).toBe("verde");
  });
  it("evento mais recente com erro é vermelho", () => {
    const d = dados({ eventos: [ev("webhook/asaas", "OK", 2 * H), ev("webhook/asaas:pagamento-sem-inscricao", "ERRO", H)] });
    expect(peca(d, "webhook-asaas").cor).toBe("vermelho");
  });
  it("erro nas últimas 24 h seguido de sucesso é amarelo", () => {
    const d = dados({ eventos: [ev("route:/api/assinaturas/webhook/asaas", "ERRO", 2 * H), ev("webhook/asaas", "OK", H)] });
    expect(peca(d, "webhook-asaas").cor).toBe("amarelo");
  });
  it("erro de boas-vindas não acende o webhook", () => {
    const d = dados({ eventos: [ev("webhook/asaas:boas-vindas", "ERRO", H)] });
    expect(peca(d, "webhook-asaas").cor).toBe("verde");
    expect(peca(d, "email").cor).toBe("amarelo");
  });
});

describe("provisionamento", () => {
  it.each([
    [10 * MIN, "verde"],
    [16 * MIN, "amarelo"],
    [61 * MIN, "vermelho"],
  ])("inscrição paga há %i ms é %s", (ms, cor) => {
    expect(peca(dados({ inscricoesPagas: { total: 1, maisAntiga: ha(ms) } }), "provisionamento").cor).toBe(cor);
  });
  it("sem inscrição paga esperando é verde", () => {
    expect(peca(dados(), "provisionamento").cor).toBe("verde");
  });
});

describe("pagamentos, e-mail e rotas", () => {
  it("pagamentos: 3 erros na hora é vermelho, 1 em 24 h é amarelo", () => {
    const tres = [1, 2, 3].map((i) => ev("webhook/pagamento", "ERRO", i * MIN));
    expect(peca(dados({ eventos: tres }), "pagamentos").cor).toBe("vermelho");
    expect(peca(dados({ eventos: [ev("webhook/pagamento", "ERRO", 5 * H)] }), "pagamentos").cor).toBe("amarelo");
  });
  it("e-mail: 3 na hora é vermelho", () => {
    const tres = [1, 2, 3].map((i) => ev("forgot-password:envio", "ERRO", i * MIN));
    expect(peca(dados({ eventos: tres }), "email").cor).toBe("vermelho");
  });
  it("rotas: 1 na hora é amarelo, 10 é vermelho, erro de ontem não conta", () => {
    expect(peca(dados({ eventos: [ev("render:/adm", "ERRO", 5 * MIN)] }), "rotas").cor).toBe("amarelo");
    const dez = Array.from({ length: 10 }, (_, i) => ev("render:/adm", "ERRO", (i + 1) * MIN));
    expect(peca(dados({ eventos: dez }), "rotas").cor).toBe("vermelho");
    expect(peca(dados({ eventos: [ev("render:/adm", "ERRO", 2 * H)] }), "rotas").cor).toBe("verde");
  });
  it("evento OK nunca conta como erro", () => {
    const oks = Array.from({ length: 10 }, (_, i) => ev("webhook/pagamento", "OK", (i + 1) * MIN));
    expect(peca(dados({ eventos: oks }), "pagamentos").cor).toBe("verde");
  });
});

describe("pedidos", () => {
  it("zero na última hora quando o normal é 5 ou mais é amarelo", () => {
    const d = dados({ pedidos: { naUltimaHora: 0, mesmaHoraAntes: [5, 6, 4, 5], ultimoPedido: ha(3 * H) } });
    expect(peca(d, "pedidos").cor).toBe("amarelo");
  });
  it("madrugada (média abaixo de 5) é neutro, mesmo com zero", () => {
    const d = dados({ pedidos: { naUltimaHora: 0, mesmaHoraAntes: [0, 0, 1, 0], ultimoPedido: ha(6 * H) } });
    expect(peca(d, "pedidos").cor).toBe("neutro");
  });
  it("nunca fica vermelho", () => {
    const d = dados({ pedidos: { naUltimaHora: 0, mesmaHoraAntes: [100, 100, 100, 100], ultimoPedido: null } });
    expect(peca(d, "pedidos").cor).toBe("amarelo");
  });
  it("sem histórico (lista vazia) é neutro", () => {
    const d = dados({ pedidos: { naUltimaHora: 3, mesmaHoraAntes: [], ultimoPedido: ha(MIN) } });
    expect(peca(d, "pedidos").cor).toBe("neutro");
  });
});
