import { describe, it, expect } from "vitest";
import { dispensaAtiva, marcarDispensa, DIAS_DE_SILENCIO } from "./dispensa";

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date("2026-09-02T12:00:00Z").getTime();

describe("dispensaAtiva", () => {
  it("é falsa quando ninguém dispensou nada", () => {
    expect(dispensaAtiva(null, AGORA)).toBe(false);
  });

  it("cala o convite durante o prazo", () => {
    const ontem = String(AGORA - DIA);
    expect(dispensaAtiva(ontem, AGORA)).toBe(true);
  });

  it("volta a convidar depois do prazo", () => {
    const velho = String(AGORA - (DIAS_DE_SILENCIO + 1) * DIA);
    expect(dispensaAtiva(velho, AGORA)).toBe(false);
  });

  it("trata a borda exata como prazo vencido", () => {
    const naBorda = String(AGORA - DIAS_DE_SILENCIO * DIA);
    expect(dispensaAtiva(naBorda, AGORA)).toBe(false);
  });

  it("ignora lixo gravado na chave", () => {
    // localStorage é editável por qualquer script e sobrevive a mudanças de
    // formato. Um valor ilegível não pode calar o convite para sempre.
    expect(dispensaAtiva("abacaxi", AGORA)).toBe(false);
    expect(dispensaAtiva("", AGORA)).toBe(false);
    expect(dispensaAtiva("NaN", AGORA)).toBe(false);
  });

  it("ignora carimbo no futuro", () => {
    // Relógio do aparelho adiantado, ou valor plantado à mão: sem isto o
    // convite ficaria silenciado até a data chegar.
    const futuro = String(AGORA + 400 * DIA);
    expect(dispensaAtiva(futuro, AGORA)).toBe(false);
  });
});

describe("marcarDispensa", () => {
  it("grava um carimbo que a própria dispensaAtiva reconhece", () => {
    expect(dispensaAtiva(marcarDispensa(AGORA), AGORA)).toBe(true);
  });
});
