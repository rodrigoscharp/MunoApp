import { describe, expect, it } from "vitest";
import { diasDeAtraso, statusPelaRegua } from "./regua";

const HOJE = new Date("2026-08-20T12:00:00Z");
function diasAtras(n: number): Date {
  return new Date(HOJE.getTime() - n * 24 * 60 * 60 * 1000);
}

describe("diasDeAtraso", () => {
  it("conta dias inteiros, ignorando a hora", () => {
    // Vencimento às 23h de ontem e agora meio-dia de hoje é 1 dia de atraso,
    // não 0,5. Cobrança se conta em dias de calendário, não em frações.
    expect(diasDeAtraso(new Date("2026-08-19T23:00:00Z"), HOJE)).toBe(1);
  });

  it("é zero no próprio dia do vencimento", () => {
    expect(diasDeAtraso(new Date("2026-08-20T01:00:00Z"), HOJE)).toBe(0);
  });

  it("é negativo antes de vencer", () => {
    expect(diasDeAtraso(new Date("2026-08-25T12:00:00Z"), HOJE)).toBe(-5);
  });
});

describe("statusPelaRegua", () => {
  it("sem cobrança vencida, fica ATIVA", () => {
    expect(statusPelaRegua(null, HOJE)).toBe("ATIVA");
  });

  it.each([0, 1, 6])("atraso de %i dias ainda é ATIVA", (dias) => {
    // Atraso curto não marca o cadastro — a tela avisa, o status não muda.
    expect(statusPelaRegua(diasAtras(dias), HOJE)).toBe("ATIVA");
  });

  it.each([7, 8, 14])("atraso de %i dias é INADIMPLENTE", (dias) => {
    expect(statusPelaRegua(diasAtras(dias), HOJE)).toBe("INADIMPLENTE");
  });

  it.each([15, 30, 365])("atraso de %i dias é BLOQUEADA", (dias) => {
    expect(statusPelaRegua(diasAtras(dias), HOJE)).toBe("BLOQUEADA");
  });

  it("as bordas caem do lado certo", () => {
    // 6 -> 7 e 14 -> 15 são onde o comportamento muda. Um erro de <= aqui
    // bloqueia um restaurante um dia antes do combinado.
    expect(statusPelaRegua(diasAtras(6), HOJE)).toBe("ATIVA");
    expect(statusPelaRegua(diasAtras(7), HOJE)).toBe("INADIMPLENTE");
    expect(statusPelaRegua(diasAtras(14), HOJE)).toBe("INADIMPLENTE");
    expect(statusPelaRegua(diasAtras(15), HOJE)).toBe("BLOQUEADA");
  });
});
