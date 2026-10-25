import { describe, expect, it } from "vitest";
import { caixaDoProduto } from "./remover-fundo";

describe("caixaDoProduto", () => {
  it("corta em volta do que é produto, com folga", () => {
    const largura = 100, altura = 100;
    const alfa = new Uint8Array(largura * altura);
    for (let y = 40; y < 60; y++) for (let x = 30; x < 70; x++) alfa[y * largura + x] = 255;
    const caixa = caixaDoProduto(alfa, largura, altura);
    // 40 px de largura, folga de 4% do maior lado (2 px) em volta.
    expect(caixa).toEqual({ x: 28, y: 38, largura: 44, altura: 24 });
  });

  it("não passa da borda da imagem", () => {
    const alfa = new Uint8Array(10 * 10).fill(255);
    expect(caixaDoProduto(alfa, 10, 10)).toEqual({ x: 0, y: 0, largura: 10, altura: 10 });
  });

  it("sem produto reconhecido, a imagem inteira", () => {
    expect(caixaDoProduto(new Uint8Array(16), 4, 4)).toEqual({ x: 0, y: 0, largura: 4, altura: 4 });
  });
});
