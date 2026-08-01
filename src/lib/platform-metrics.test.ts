import { describe, expect, it } from "vitest";
import { calcularMrr, montarPauta } from "./platform-metrics";

const AGORA = new Date("2026-08-01T12:00:00Z");
const diasAtras = (d: number) =>
  new Date(AGORA.getTime() - d * 24 * 60 * 60 * 1000);

const lead = (over: Partial<Parameters<typeof montarPauta>[0][number]> = {}) => ({
  status: "NOVO",
  tenantId: null,
  updatedAt: AGORA,
  ...over,
});

describe("montarPauta", () => {
  it("convida a cadastrar quando não há lead nenhum", () => {
    const pauta = montarPauta([], AGORA);
    expect(pauta).toHaveLength(1);
    expect(pauta[0].chave).toBe("sem-leads");
  });

  it("diz que está tudo em dia quando nada precisa de atenção", () => {
    const pauta = montarPauta([lead({ status: "CONTATADO" })], AGORA);
    expect(pauta).toHaveLength(1);
    expect(pauta[0].chave).toBe("em-dia");
  });

  it("avisa sobre venda fechada que não virou cliente", () => {
    const pauta = montarPauta([lead({ status: "FECHADO", tenantId: null })], AGORA);
    expect(pauta.map((i) => i.chave)).toContain("fechado-sem-cliente");
  });

  it("não avisa quando o lead fechado já tem cliente criado", () => {
    const pauta = montarPauta([lead({ status: "FECHADO", tenantId: "t1" })], AGORA);
    expect(pauta.map((i) => i.chave)).not.toContain("fechado-sem-cliente");
  });

  it("aponta leads abertos sem contato há mais de 5 dias", () => {
    const pauta = montarPauta([lead({ updatedAt: diasAtras(6) })], AGORA);
    expect(pauta.map((i) => i.chave)).toContain("parados");
  });

  it("não considera parado um lead tocado há 4 dias", () => {
    const pauta = montarPauta([lead({ updatedAt: diasAtras(4) })], AGORA);
    expect(pauta.map((i) => i.chave)).not.toContain("parados");
  });

  it("não considera parado um lead tocado exatamente há 5 dias", () => {
    // Esta é a fronteira: a regra é "mais de 5 dias", não "5 ou mais".
    // Sem este teste, trocar < por <= na implementação passaria despercebido.
    const pauta = montarPauta([lead({ updatedAt: diasAtras(5) })], AGORA);
    expect(pauta.map((i) => i.chave)).not.toContain("parados");
  });

  it("ignora fechados e perdidos na contagem de parados", () => {
    const pauta = montarPauta(
      [
        lead({ status: "PERDIDO", updatedAt: diasAtras(30) }),
        lead({ status: "FECHADO", tenantId: "t1", updatedAt: diasAtras(30) }),
      ],
      AGORA
    );
    expect(pauta.map((i) => i.chave)).not.toContain("parados");
  });

  it("conta quem está em negociação", () => {
    const pauta = montarPauta([lead({ status: "NEGOCIACAO" })], AGORA);
    expect(pauta.map((i) => i.chave)).toContain("negociando");
  });

  it("acumula as regras do meio quando mais de uma bate", () => {
    const pauta = montarPauta(
      [
        lead({ status: "FECHADO", tenantId: null }),
        lead({ status: "NEGOCIACAO", updatedAt: diasAtras(9) }),
      ],
      AGORA
    );
    expect(pauta.map((i) => i.chave)).toEqual([
      "fechado-sem-cliente",
      "parados",
      "negociando",
    ]);
  });

  it("usa singular e plural corretamente", () => {
    const um = montarPauta([lead({ updatedAt: diasAtras(6) })], AGORA);
    expect(um[0].texto).toContain("1 lead sem contato");

    const dois = montarPauta(
      [lead({ updatedAt: diasAtras(6) }), lead({ updatedAt: diasAtras(7) })],
      AGORA
    );
    expect(dois[0].texto).toContain("2 leads sem contato");
  });

  it("usa singular e plural em fechados sem cliente", () => {
    const um = montarPauta([lead({ status: "FECHADO", tenantId: null })], AGORA);
    expect(um[0].texto).toContain("1 fechado sem");

    const dois = montarPauta(
      [
        lead({ status: "FECHADO", tenantId: null }),
        lead({ status: "FECHADO", tenantId: null }),
      ],
      AGORA
    );
    expect(dois[0].texto).toContain("2 fechados sem");
  });
});

describe("calcularMrr", () => {
  it("soma a mensalidade dos clientes ativos", () => {
    expect(
      calcularMrr([
        { status: "active", valorMensal: 199.9 },
        { status: "active", valorMensal: 100.1 },
      ])
    ).toBe(300);
  });

  it("aceita Decimal do Prisma", () => {
    expect(
      calcularMrr([{ status: "active", valorMensal: { toString: () => "149.90" } }])
    ).toBe(149.9);
  });

  it("ignora cliente inativo", () => {
    expect(
      calcularMrr([
        { status: "active", valorMensal: 100 },
        { status: "suspended", valorMensal: 999 },
      ])
    ).toBe(100);
  });

  it("ignora cliente sem mensalidade definida", () => {
    expect(
      calcularMrr([
        { status: "active", valorMensal: null },
        { status: "active", valorMensal: 50 },
      ])
    ).toBe(50);
  });

  it("devolve zero sem clientes", () => {
    expect(calcularMrr([])).toBe(0);
  });
});
