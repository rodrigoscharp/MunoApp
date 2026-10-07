import { describe, expect, it } from "vitest";
import { horaEmBrasilia, montarPedidosPorHora } from "./pedidos";

describe("horaEmBrasilia", () => {
  it("converte UTC para a hora de São Paulo", () => {
    expect(horaEmBrasilia(new Date("2026-10-10T23:30:00Z"))).toBe(20);
    expect(horaEmBrasilia(new Date("2026-10-11T02:59:00Z"))).toBe(23);
    expect(horaEmBrasilia(new Date("2026-10-11T03:00:00Z"))).toBe(0);
  });
});

describe("montarPedidosPorHora", () => {
  const anteriores = ["2026-10-03", "2026-09-26", "2026-09-19", "2026-09-12"];

  it("uma barra por hora, de 0 até a hora atual, com a média das semanas", () => {
    const barras = montarPedidosPorHora(
      [
        { dia: "2026-10-10", hora: 1, n: 3 },
        { dia: "2026-10-03", hora: 1, n: 4 },
        { dia: "2026-09-26", hora: 1, n: 8 },
        { dia: "2026-10-10", hora: 2, n: 1 },
      ],
      "2026-10-10",
      anteriores,
      2
    );
    expect(barras).toEqual([
      { hora: 0, hoje: 0, media: 0 },
      { hora: 1, hoje: 3, media: 3 }, // (4 + 8 + 0 + 0) / 4
      { hora: 2, hoje: 1, media: 0 },
    ]);
  });

  it("ignora linhas de dias que não estão na comparação", () => {
    const barras = montarPedidosPorHora([{ dia: "2026-10-09", hora: 0, n: 50 }], "2026-10-10", anteriores, 0);
    expect(barras).toEqual([{ hora: 0, hoje: 0, media: 0 }]);
  });
});
