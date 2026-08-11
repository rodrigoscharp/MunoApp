import { describe, expect, it } from "vitest";
import { CORTESIA_MAX_DIAS, inicioDaCobranca } from "./inicio";

const DIA_10 = 10;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

describe("inicioDaCobranca", () => {
  it("cai no dia contratado do mês corrente quando ele ainda vem", () => {
    expect(iso(inicioDaCobranca(new Date("2026-08-05T12:00:00Z"), 0, DIA_10))).toBe(
      "2026-08-10"
    );
  });

  it("rola para o mês seguinte quando o dia já passou", () => {
    expect(iso(inicioDaCobranca(new Date("2026-08-20T12:00:00Z"), 0, DIA_10))).toBe(
      "2026-09-10"
    );
  });

  it("rola quando o dia contratado é hoje", () => {
    // Vencer hoje é vencer sem aviso nenhum. Mesma escolha que o backfill da
    // migração fez, para os dois caminhos não divergirem.
    expect(iso(inicioDaCobranca(new Date("2026-08-10T12:00:00Z"), 0, DIA_10))).toBe(
      "2026-09-10"
    );
  });

  it("nunca devolve data no passado, seja qual for a cortesia", () => {
    const hoje = new Date("2026-08-20T12:00:00Z");
    for (const cortesia of [0, 1, 7, 15, 30, 45, 90, 365]) {
      const inicio = inicioDaCobranca(hoje, cortesia, DIA_10);
      expect(inicio.getTime()).toBeGreaterThan(hoje.getTime());
    }
  });

  it("a cortesia empurra para depois do prazo, não para o mês seguinte a ele", () => {
    // 30 dias a partir de 05/08 termina em 04/09; o primeiro vencimento é o
    // dia 10 de setembro, não o de outubro. Cortesia é piso, não pulo de mês.
    expect(iso(inicioDaCobranca(new Date("2026-08-05T12:00:00Z"), 30, DIA_10))).toBe(
      "2026-09-10"
    );
  });

  it("cortesia longa atravessa a virada de ano", () => {
    expect(iso(inicioDaCobranca(new Date("2026-11-20T12:00:00Z"), 60, DIA_10))).toBe(
      "2027-02-10"
    );
  });

  it("respeita o dia 28, o teto do projeto", () => {
    expect(iso(inicioDaCobranca(new Date("2026-02-01T12:00:00Z"), 0, 28))).toBe(
      "2026-02-28"
    );
  });

  it("recusa cortesia negativa ou acima do teto", () => {
    const hoje = new Date("2026-08-05T12:00:00Z");
    expect(() => inicioDaCobranca(hoje, -1, DIA_10)).toThrow();
    expect(() => inicioDaCobranca(hoje, CORTESIA_MAX_DIAS + 1, DIA_10)).toThrow();
  });

  it("recusa dia de vencimento fora de 1..28", () => {
    const hoje = new Date("2026-08-05T12:00:00Z");
    expect(() => inicioDaCobranca(hoje, 0, 0)).toThrow();
    expect(() => inicioDaCobranca(hoje, 0, 29)).toThrow();
  });
});
