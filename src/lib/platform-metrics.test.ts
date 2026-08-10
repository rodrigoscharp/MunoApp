import { describe, expect, it } from "vitest";
import {
  calcularMrr,
  contarLeadsAbertos,
  inicioDaSemana,
  montarPauta,
  montarSemanas,
} from "./platform-metrics";

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
  it("soma a mensalidade das assinaturas", () => {
    expect(
      calcularMrr([
        { status: "ATIVA", valorMensal: 199.9 },
        { status: "ATIVA", valorMensal: 100.1 },
      ])
    ).toBe(300);
  });

  it("aceita Decimal do Prisma", () => {
    expect(
      calcularMrr([{ status: "ATIVA", valorMensal: { toString: () => "149.90" } }])
    ).toBe(149.9);
  });

  /**
   * As duas metades da regra, uma em cada teste. O inadimplente é o que muda em
   * relação ao MRR antigo, que somava tenant ativo: quem está atrasado continua
   * devendo, e tirá-lo da soma faria a receita contratada cair justamente
   * quando a inadimplência sobe — escondendo o número que precisa ser visto.
   */
  it("mantém assinatura inadimplente e bloqueada na soma", () => {
    expect(
      calcularMrr([
        { status: "ATIVA", valorMensal: 100 },
        { status: "INADIMPLENTE", valorMensal: 200 },
        { status: "BLOQUEADA", valorMensal: 300 },
      ])
    ).toBe(600);
  });

  it("tira da soma só a assinatura cancelada", () => {
    expect(
      calcularMrr([
        { status: "ATIVA", valorMensal: 100 },
        { status: "CANCELADA", valorMensal: 999 },
      ])
    ).toBe(100);
  });

  it("devolve zero sem assinaturas", () => {
    expect(calcularMrr([])).toBe(0);
  });
});

describe("contarLeadsAbertos", () => {
  it("conta NOVO, CONTATADO e NEGOCIACAO", () => {
    expect(
      contarLeadsAbertos([
        { status: "NOVO" },
        { status: "CONTATADO" },
        { status: "NEGOCIACAO" },
      ])
    ).toBe(3);
  });

  it("não conta fechado nem perdido", () => {
    expect(
      contarLeadsAbertos([{ status: "FECHADO" }, { status: "PERDIDO" }])
    ).toBe(0);
  });

  it("devolve zero sem leads", () => {
    expect(contarLeadsAbertos([])).toBe(0);
  });
});

describe("inicioDaSemana", () => {
  it("recua uma quarta-feira até a segunda", () => {
    // 2026-08-05 é uma quarta.
    const s = inicioDaSemana(new Date(2026, 7, 5, 15, 30));
    expect(s.getDate()).toBe(3);
    expect(s.getHours()).toBe(0);
  });

  it("mantém a segunda no lugar", () => {
    expect(inicioDaSemana(new Date(2026, 7, 3, 23, 59)).getDate()).toBe(3);
  });

  it("recua o domingo seis dias, não avança um", () => {
    // Domingo é o fim da semana, não o começo — o erro clássico aqui.
    expect(inicioDaSemana(new Date(2026, 7, 9, 12)).getDate()).toBe(3);
  });
});

describe("montarSemanas", () => {
  const QUARTA = new Date(2026, 7, 5, 12);

  it("devolve oito baldes por padrão", () => {
    expect(montarSemanas([], QUARTA)).toHaveLength(8);
  });

  it("põe um lead de hoje na última semana", () => {
    const s = montarSemanas([new Date(2026, 7, 5, 9)], QUARTA);
    expect(s[7].leads).toBe(1);
    expect(s.slice(0, 7).every((x) => x.leads === 0)).toBe(true);
  });

  it("põe um lead de duas semanas atrás no balde certo", () => {
    const s = montarSemanas([new Date(2026, 6, 22, 9)], QUARTA);
    expect(s[5].leads).toBe(1);
    expect(s.reduce((t, x) => t + x.leads, 0)).toBe(1);
  });

  it("descarta o que é mais antigo que a janela", () => {
    const s = montarSemanas([new Date(2026, 4, 1)], QUARTA);
    expect(s.reduce((t, x) => t + x.leads, 0)).toBe(0);
  });

  it("não conta duas vezes um lead na virada da semana", () => {
    // Segunda 00:00 pertence à semana que começa, não à que terminou.
    const s = montarSemanas([new Date(2026, 7, 3, 0, 0, 0)], QUARTA);
    expect(s.reduce((t, x) => t + x.leads, 0)).toBe(1);
    expect(s[7].leads).toBe(1);
  });

  it("rotula a semana com o dia da segunda", () => {
    expect(montarSemanas([], QUARTA)[7].semana).toBe("03/08");
  });
});
