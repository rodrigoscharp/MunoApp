import { describe, expect, it } from "vitest";
import { normalizarOrigem, resumir } from "./resumo";

describe("normalizarOrigem", () => {
  // Instagram e instagram viram duas linhas de resumo se ninguém normalizar, e
  // o gráfico passa a mostrar a mesma campanha em dois lugares.
  it.each(["Instagram", " instagram ", "INSTAGRAM"])(
    "colapsa %s em instagram",
    (bruto) => {
      expect(normalizarOrigem(bruto)).toBe("instagram");
    }
  );

  it.each([null, undefined, "", "   "])(
    "vira 'direto' quando não há utm (%s)",
    (bruto) => {
      expect(normalizarOrigem(bruto)).toBe("direto");
    }
  );
});

describe("resumir", () => {
  const dia = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

  it("agrupa por dia, tipo e origem", () => {
    const linhas = resumir([
      { tipo: "VISITA", createdAt: dia("2026-06-01"), origem: "instagram" },
      { tipo: "VISITA", createdAt: dia("2026-06-01"), origem: "instagram" },
      { tipo: "VISITA", createdAt: dia("2026-06-01"), origem: "google" },
      { tipo: "PAGOU", createdAt: dia("2026-06-02"), origem: "instagram" },
    ]);

    expect(linhas).toHaveLength(3);
    expect(linhas).toContainEqual({
      dia: new Date("2026-06-01T00:00:00.000Z"),
      tipo: "VISITA",
      origem: "instagram",
      n: 2,
    });
  });

  // O evento de servidor não tem sessão, e sem sessão não tem utm. Ele conta
  // como "direto" em vez de sumir: um PAGOU descartado quebraria a soma da
  // conversão contra a mesma série de visitas.
  it("conta evento sem origem como direto", () => {
    const linhas = resumir([
      { tipo: "PAGOU", createdAt: dia("2026-06-01"), origem: null },
    ]);

    expect(linhas).toEqual([
      {
        dia: new Date("2026-06-01T00:00:00.000Z"),
        tipo: "PAGOU",
        origem: "direto",
        n: 1,
      },
    ]);
  });

  it("devolve lista vazia sem evento nenhum", () => {
    expect(resumir([])).toEqual([]);
  });
});
