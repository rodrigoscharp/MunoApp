import { describe, expect, it } from "vitest";
import {
  chaveDoDia,
  contarEntre,
  preencherDias,
  recebidoPorMes,
  serieAcumulada,
  serieDeMrr,
  somarPorMes,
  ultimosMeses,
  variacao,
} from "./platform-series";

const AGORA = new Date("2026-09-15T15:00:00Z");

describe("chaveDoDia", () => {
  it("usa o calendário de São Paulo, não o do servidor", () => {
    // 01h UTC do dia 16 ainda é 22h do dia 15 em São Paulo.
    expect(chaveDoDia(new Date("2026-09-16T01:00:00Z"))).toBe("2026-09-15");
  });
});

describe("ultimosMeses", () => {
  it("atravessa a virada do ano", () => {
    expect(ultimosMeses(new Date("2026-02-10T15:00:00Z"), 4)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("não pula fevereiro partindo de um dia 31", () => {
    expect(ultimosMeses(new Date("2026-03-31T15:00:00Z"), 2)).toEqual([
      "2026-02",
      "2026-03",
    ]);
  });
});

describe("serieDeMrr", () => {
  const assinatura = (
    criada: string,
    valor: number,
    status = "ATIVA",
    atualizada = criada
  ) => ({
    status,
    valorMensal: valor,
    createdAt: new Date(criada),
    updatedAt: new Date(atualizada),
  });

  it("soma a partir do mês de criação", () => {
    const serie = serieDeMrr(
      [assinatura("2026-08-10T15:00:00Z", 99.9)],
      AGORA,
      3
    );
    expect(serie.map((p) => p.valor)).toEqual([0, 99.9, 99.9]);
    expect(serie.map((p) => p.rotulo)).toEqual(["jul", "ago", "set"]);
  });

  it("tira a cancelada a partir do mês do cancelamento", () => {
    const serie = serieDeMrr(
      [
        assinatura("2026-06-01T15:00:00Z", 100),
        assinatura(
          "2026-06-01T15:00:00Z",
          50,
          "CANCELADA",
          "2026-08-20T15:00:00Z"
        ),
      ],
      AGORA,
      3
    );
    expect(serie.map((p) => p.valor)).toEqual([150, 100, 100]);
  });

  it("não acumula erro de ponto flutuante", () => {
    const serie = serieDeMrr(
      [
        assinatura("2026-09-01T15:00:00Z", 199.9),
        assinatura("2026-09-01T15:00:00Z", 100.1),
      ],
      AGORA,
      1
    );
    expect(serie[0].valor).toBe(300);
  });
});

describe("serieAcumulada", () => {
  it("conta quem existia no fim de cada mês", () => {
    const serie = serieAcumulada(
      [new Date("2026-07-05T15:00:00Z"), new Date("2026-09-01T15:00:00Z")],
      AGORA,
      3
    );
    expect(serie.map((p) => p.valor)).toEqual([1, 1, 2]);
  });
});

describe("recebidoPorMes", () => {
  it("agrupa pelo pagamento e ignora cobrança sem data", () => {
    const serie = recebidoPorMes(
      [
        { valor: 99.9, pagoEm: new Date("2026-08-05T15:00:00Z") },
        { valor: 99.9, pagoEm: new Date("2026-08-25T15:00:00Z") },
        { valor: 50, pagoEm: null },
      ],
      AGORA,
      2
    );
    expect(serie.map((p) => p.valor)).toEqual([199.8, 0]);
  });
});

describe("preencherDias", () => {
  it("devolve exatamente N dias terminando hoje, com zero nos vazios", () => {
    const pontos = preencherDias(
      [{ dia: "2026-09-14", pedidos: 4, volume: 120.5 }],
      AGORA,
      3
    );
    expect(pontos.map((p) => p.dia)).toEqual([
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
    ]);
    expect(pontos.map((p) => p.pedidos)).toEqual([0, 4, 0]);
    expect(pontos[1].rotulo).toBe("14/09");
  });
});

describe("somarPorMes", () => {
  it("junta os dias do mesmo mês", () => {
    const meses = somarPorMes(
      preencherDias(
        [
          { dia: "2026-08-31", pedidos: 2, volume: 10.1 },
          { dia: "2026-09-01", pedidos: 3, volume: 20.2 },
          { dia: "2026-09-02", pedidos: 1, volume: 0.1 },
        ],
        new Date("2026-09-02T15:00:00Z"),
        3
      )
    );
    expect(meses).toEqual([
      { dia: "2026-08", rotulo: "ago", pedidos: 2, volume: 10.1 },
      { dia: "2026-09", rotulo: "set", pedidos: 4, volume: 20.3 },
    ]);
  });
});

describe("variacao", () => {
  it("é nula quando não há base de comparação", () => {
    expect(variacao(3, 0)).toBeNull();
  });

  it("é relativa ao período anterior", () => {
    expect(variacao(15, 10)).toBeCloseTo(0.5);
    expect(variacao(5, 10)).toBeCloseTo(-0.5);
  });
});

describe("contarEntre", () => {
  it("inclui o início e exclui o fim", () => {
    const inicio = new Date("2026-09-01T00:00:00Z");
    const fim = new Date("2026-09-02T00:00:00Z");
    expect(contarEntre([inicio, fim], inicio, fim)).toBe(1);
  });
});
