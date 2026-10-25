import { describe, expect, it } from "vitest";
import { iconeDaCategoria } from "./icone-da-categoria";

describe("iconeDaCategoria", () => {
  it.each([
    ["Lanches", "lanche"],
    ["Hambúrgueres artesanais", "lanche"],
    ["Bebidas geladas", "bebida"],
    ["Porções para dividir", "porcao"],
    ["Sobremesas", "doce"],
    ["Pizzas salgadas", "pizza"],
    ["Açaí no copo", "acai"],
    ["Pratos executivos", "prato"],
  ])("%s vira %s", (nome, icone) => {
    expect(iconeDaCategoria(nome)).toBe(icone);
  });

  it("ignora acento e caixa", () => {
    expect(iconeDaCategoria("PORÇÕES")).toBe("porcao");
    expect(iconeDaCategoria("acai")).toBe("acai");
  });

  it("combo vence o lanche que vem dentro dele", () => {
    expect(iconeDaCategoria("Combo de lanche")).toBe("combo");
  });

  it("o que não reconhece recebe o genérico, nunca um ícone errado", () => {
    expect(iconeDaCategoria("Especiais da casa")).toBe("generico");
    expect(iconeDaCategoria("")).toBe("generico");
  });
});
