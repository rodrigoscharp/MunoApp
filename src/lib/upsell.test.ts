/**
 * A sugestão de "leva também" no carrinho.
 *
 * Regra: uma sugestão por categoria que o carrinho ainda não tocou, sempre o
 * item mais barato disponível dela, até o limite.
 */

import { describe, expect, it } from "vitest";
import { getUpsellSuggestions } from "@/lib/upsell";
import type { CategoryWithItems } from "@/types";

type Item = {
  id: string;
  name: string;
  price: number;
  available: boolean;
  imageUrl: string | null;
};

function categoria(nome: string, itens: Partial<Item>[]): CategoryWithItems {
  return {
    id: `cat-${nome}`,
    name: nome,
    items: itens.map((i, n) => ({
      id: i.id ?? `${nome}-${n}`,
      name: i.name ?? `${nome} ${n}`,
      price: i.price ?? 10,
      available: i.available ?? true,
      imageUrl: i.imageUrl ?? null,
    })),
  } as unknown as CategoryWithItems;
}

describe("getUpsellSuggestions", () => {
  it("sugere o item mais barato de cada categoria intocada", () => {
    const cats = [
      categoria("bebidas", [{ id: "b1", price: 8 }, { id: "b2", price: 5 }]),
      categoria("sobremesas", [{ id: "s1", price: 12 }, { id: "s2", price: 20 }]),
    ];

    expect(getUpsellSuggestions([], cats).map((s) => s.id)).toEqual(["b2", "s1"]);
  });

  it("não sugere nada de uma categoria que já está no carrinho", () => {
    const cats = [
      categoria("bebidas", [{ id: "b1", price: 8 }, { id: "b2", price: 5 }]),
      categoria("sobremesas", [{ id: "s1", price: 12 }]),
    ];

    expect(getUpsellSuggestions(["b1"], cats).map((s) => s.id)).toEqual(["s1"]);
  });

  it("ignora item indisponível na escolha do mais barato", () => {
    const cats = [
      categoria("bebidas", [
        { id: "b1", price: 3, available: false },
        { id: "b2", price: 9 },
      ]),
    ];

    expect(getUpsellSuggestions([], cats).map((s) => s.id)).toEqual(["b2"]);
  });

  it("pula categoria em que nada está disponível", () => {
    const cats = [
      categoria("bebidas", [{ id: "b1", price: 3, available: false }]),
      categoria("sobremesas", [{ id: "s1", price: 12 }]),
    ];

    expect(getUpsellSuggestions([], cats).map((s) => s.id)).toEqual(["s1"]);
  });

  it("pula categoria vazia", () => {
    const cats = [categoria("vazia", []), categoria("sobremesas", [{ id: "s1" }])];
    expect(getUpsellSuggestions([], cats).map((s) => s.id)).toEqual(["s1"]);
  });

  it("respeita o limite padrão de três sugestões", () => {
    const cats = ["a", "b", "c", "d", "e"].map((n) => categoria(n, [{ id: n }]));
    expect(getUpsellSuggestions([], cats)).toHaveLength(3);
  });

  it("respeita um limite menor", () => {
    const cats = ["a", "b", "c"].map((n) => categoria(n, [{ id: n }]));
    expect(getUpsellSuggestions([], cats, new Set(), 1)).toHaveLength(1);
  });

  it("devolve lista vazia quando não há categoria nenhuma", () => {
    expect(getUpsellSuggestions([], [])).toEqual([]);
  });

  it("devolve o item com os campos que o card precisa", () => {
    const cats = [
      categoria("bebidas", [
        { id: "b1", name: "Guaraná", price: 7.5, imageUrl: "https://x/img.png" },
      ]),
    ];

    expect(getUpsellSuggestions([], cats)).toEqual([
      { id: "b1", name: "Guaraná", price: 7.5, imageUrl: "https://x/img.png" },
    ]);
  });

  it("converte o preço Decimal do banco em número", () => {
    const cats = [
      categoria("bebidas", [{ id: "b1", price: "7.50" as unknown as number }]),
    ];

    const [sugestao] = getUpsellSuggestions([], cats);
    expect(sugestao.price).toBe(7.5);
    expect(typeof sugestao.price).toBe("number");
  });
});

describe("itens dispensados pelo cliente", () => {
  it("não sugere de novo o que já foi dispensado", () => {
    const cats = [
      categoria("bebidas", [{ id: "b1", price: 5 }]),
      categoria("sobremesas", [{ id: "s1", price: 12 }]),
    ];

    expect(getUpsellSuggestions([], cats, new Set(["b1"])).map((s) => s.id)).toEqual(["s1"]);
  });

  /**
   * Comportamento atual, registrado porque é uma decisão e não um acidente
   * óbvio: dispensar o item mais barato **descarta a categoria inteira**, em vez
   * de oferecer o segundo mais barato. Quem dispensou a água nunca mais vê
   * refrigerante enquanto o carrinho não mudar.
   */
  it("dispensar o mais barato descarta a categoria, não passa para o segundo", () => {
    const cats = [categoria("bebidas", [{ id: "b1", price: 5 }, { id: "b2", price: 8 }])];
    expect(getUpsellSuggestions([], cats, new Set(["b1"]))).toEqual([]);
  });
});
