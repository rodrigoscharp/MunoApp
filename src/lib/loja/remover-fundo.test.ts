import { describe, expect, it } from "vitest";
import { caixaDoProduto, nomeDoRecorte, tamanhoDoRecorte } from "./remover-fundo";

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

describe("tamanhoDoRecorte", () => {
  // O recorte sai do tamanho que o modelo devolve; em PNG isso passava dos
  // 5 MB do upload, e o dono perdia os 30 s de espera.
  it("reduz o lado maior a 1280, mantendo a proporção", () => {
    expect(tamanhoDoRecorte(4000, 3000)).toEqual({ largura: 1280, altura: 960 });
    expect(tamanhoDoRecorte(1000, 2560)).toEqual({ largura: 500, altura: 1280 });
  });

  it("não amplia recorte pequeno", () => {
    expect(tamanhoDoRecorte(300, 200)).toEqual({ largura: 300, altura: 200 });
  });

  it("aceita outro teto, para a segunda tentativa", () => {
    expect(tamanhoDoRecorte(4000, 3000, 640)).toEqual({ largura: 640, altura: 480 });
  });

  it("nunca zera um lado", () => {
    expect(tamanhoDoRecorte(5000, 1)).toEqual({ largura: 1280, altura: 1 });
  });
});

describe("nomeDoRecorte", () => {
  it("segue o tipo que o navegador gerou de fato", () => {
    expect(nomeDoRecorte(new Blob([], { type: "image/webp" }))).toBe("recorte.webp");
    expect(nomeDoRecorte(new Blob([], { type: "image/png" }))).toBe("recorte.png");
  });
});
