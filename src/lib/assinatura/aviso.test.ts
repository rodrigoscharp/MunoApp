import { describe, expect, it } from "vitest";
import { avisoDeAtraso } from "./aviso";
import { AVISO_DIAS, BLOQUEIO_DIAS, statusPelaRegua } from "./regua";

const HOJE = new Date("2026-08-20T12:00:00Z");
function diasAtras(n: number): Date {
  return new Date(HOJE.getTime() - n * 24 * 60 * 60 * 1000);
}

describe("avisoDeAtraso", () => {
  it("não avisa quando não há cobrança em aberto", () => {
    expect(avisoDeAtraso(null, HOJE)).toBeNull();
  });

  it("não avisa antes de vencer", () => {
    expect(avisoDeAtraso(new Date("2026-08-25T00:00:00Z"), HOJE)).toBeNull();
  });

  it("não avisa no próprio dia do vencimento", () => {
    // Vencer hoje não é atrasar. Avisar aqui gastaria a faixa no dia em que o
    // cliente ainda tem o dia inteiro para pagar.
    expect(avisoDeAtraso(new Date("2026-08-20T00:00:00Z"), HOJE)).toBeNull();
  });

  it.each([1, 2, 6])("é informativo com %i dia(s) de atraso", (dias) => {
    expect(avisoDeAtraso(diasAtras(dias), HOJE)).toEqual({
      tom: "INFORMATIVO",
      dias,
    });
  });

  it.each([7, 8, 14])("é firme com %i dias de atraso", (dias) => {
    expect(avisoDeAtraso(diasAtras(dias), HOJE)).toEqual({ tom: "FIRME", dias });
  });

  it.each([15, 30, 365])("explica o bloqueio com %i dias", (dias) => {
    expect(avisoDeAtraso(diasAtras(dias), HOJE)).toEqual({
      tom: "BLOQUEIO",
      dias,
    });
  });

  it("vira firme exatamente no limiar de aviso", () => {
    expect(avisoDeAtraso(diasAtras(AVISO_DIAS - 1), HOJE)?.tom).toBe(
      "INFORMATIVO"
    );
    expect(avisoDeAtraso(diasAtras(AVISO_DIAS), HOJE)?.tom).toBe("FIRME");
  });

  it("vira bloqueio exatamente no limiar de bloqueio", () => {
    expect(avisoDeAtraso(diasAtras(BLOQUEIO_DIAS - 1), HOJE)?.tom).toBe("FIRME");
    expect(avisoDeAtraso(diasAtras(BLOQUEIO_DIAS), HOJE)?.tom).toBe("BLOQUEIO");
  });

  it("avisa nos dias em que o status ainda é ATIVA", () => {
    // O teste que dá razão ao arquivo existir. Se a faixa lesse
    // assinatura.status, estes seis dias passariam em silêncio — e são
    // justamente os dias em que um aviso resolve sem bloquear ninguém.
    for (let dias = 1; dias < AVISO_DIAS; dias++) {
      const vencimento = diasAtras(dias);
      expect(statusPelaRegua(vencimento, HOJE)).toBe("ATIVA");
      expect(avisoDeAtraso(vencimento, HOJE)).not.toBeNull();
    }
  });
});
