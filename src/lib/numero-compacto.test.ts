import { describe, expect, it } from "vitest";
import { escalaBonita, numeroCompacto, percentual } from "./numero-compacto";

describe("numeroCompacto", () => {
  it("mostra centavos só em moeda abaixo de mil", () => {
    expect(numeroCompacto(299.7, true)).toBe("299,70");
    expect(numeroCompacto(299.7)).toBe("300");
  });

  it("separa milhar até dez mil", () => {
    expect(numeroCompacto(4890, true)).toBe("4.890");
  });

  it("compacta acima de dez mil", () => {
    expect(numeroCompacto(12_345)).toBe("12,3k");
    expect(numeroCompacto(128_312)).toBe("128k");
    expect(numeroCompacto(1_240_000)).toBe("1,2mi");
  });

  it("não escreve menos zero", () => {
    expect(numeroCompacto(-0.2)).toBe("0");
  });
});

describe("percentual", () => {
  it("usa vírgula e descarta o sinal", () => {
    expect(percentual(0.368)).toBe("36,8%");
    expect(percentual(-0.25)).toBe("25%");
  });
});

describe("escalaBonita", () => {
  it("é zero sem dado", () => {
    expect(escalaBonita(0)).toBe(0);
  });

  it("dá topo par para contagens pequenas, para a metade ser inteira", () => {
    expect(escalaBonita(1)).toBe(2);
    expect(escalaBonita(3)).toBe(4);
    expect(escalaBonita(7)).toBe(8);
  });

  it("arredonda para cima valores maiores", () => {
    expect(escalaBonita(27)).toBe(30);
    expect(escalaBonita(120)).toBe(150);
    expect(escalaBonita(4890)).toBe(5000);
  });
});
