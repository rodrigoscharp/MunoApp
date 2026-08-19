import { describe, expect, it } from "vitest";
import {
  diaBRT,
  inicioDeDiasAtrasBRT,
  inicioDoDiaBRT,
  inicioDoMesBRT,
} from "./faturamento";

/**
 * O bug que estes testes travam: `new Date(); d.setHours(0,0,0,0)` num servidor
 * em UTC devolve 00:00 UTC, que é 21h do dia ANTERIOR em Brasília. Das 21h à
 * meia-noite, "hoje" no gráfico já era amanhã.
 */
describe("inicioDoDiaBRT", () => {
  it("às 22h de Brasília ainda aponta para a meia-noite do mesmo dia", () => {
    // 2026-08-18 22:30 BRT = 2026-08-19 01:30 UTC
    const inicio = inicioDoDiaBRT(new Date("2026-08-19T01:30:00Z"));
    expect(inicio.toISOString()).toBe("2026-08-18T03:00:00.000Z");
  });

  it("logo depois da meia-noite de Brasília vira o dia", () => {
    // 2026-08-19 00:10 BRT = 2026-08-19 03:10 UTC
    const inicio = inicioDoDiaBRT(new Date("2026-08-19T03:10:00Z"));
    expect(inicio.toISOString()).toBe("2026-08-19T03:00:00.000Z");
  });
});

describe("inicioDoMesBRT", () => {
  it("no dia 1º às 22h BRT ainda é o mês corrente, não o anterior", () => {
    // 2026-08-01 22:00 BRT = 2026-08-02 01:00 UTC
    expect(inicioDoMesBRT(new Date("2026-08-02T01:00:00Z")).toISOString()).toBe(
      "2026-08-01T03:00:00.000Z"
    );
  });

  it("no último dia do mês em BRT ainda não virou o mês seguinte", () => {
    // 2026-07-31 23:00 BRT = 2026-08-01 02:00 UTC
    expect(inicioDoMesBRT(new Date("2026-08-01T02:00:00Z")).toISOString()).toBe(
      "2026-07-01T03:00:00.000Z"
    );
  });
});

describe("inicioDeDiasAtrasBRT", () => {
  it("conta dias inteiros a partir da meia-noite de Brasília", () => {
    expect(
      inicioDeDiasAtrasBRT(new Date("2026-08-19T01:30:00Z"), 30).toISOString()
    ).toBe("2026-07-19T03:00:00.000Z");
  });
});

describe("diaBRT", () => {
  it("agrupa um pedido das 22h no dia em que o restaurante o serviu", () => {
    // 2026-08-18 22:30 BRT — em UTC já é dia 19, e era assim que o gráfico
    // empilhava a noite inteira na barra do dia seguinte.
    expect(diaBRT(new Date("2026-08-19T01:30:00Z"))).toBe("2026-08-18");
  });

  it("mantém o dia para um pedido do meio da tarde", () => {
    expect(diaBRT(new Date("2026-08-18T18:00:00Z"))).toBe("2026-08-18");
  });
});
