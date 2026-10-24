/**
 * O cache do cardápio.
 *
 * Os dois bugs que este arquivo trava: o vazio de uma falha de banco gravado no
 * cache como se fosse o cardápio, e a tag global que fazia a edição de um
 * restaurante invalidar o cache de todos.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const categoryFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { category: { findMany: (...a: unknown[]) => categoryFindMany(...a) } },
}));

const reportarErro = vi.fn();
vi.mock("@/lib/observabilidade", () => ({
  reportarErro: (...a: unknown[]) => reportarErro(...a),
}));

// unstable_cache transparente, mas registrando chave e opções: o teste quer
// saber COMO o cache foi pedido, não exercer o cache do Next.
const unstableCache = vi.fn(
  <T extends (...args: never[]) => unknown>(fn: T, _chave: string[], _opcoes: unknown) => fn
);
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  unstable_cache: (...a: Parameters<typeof unstableCache>) => unstableCache(...a),
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
}));

import {
  cardTemPrioridade,
  itemParaCard,
  itemParaFiltro,
  getCardapio,
  getCardapioOuVazio,
  invalidarCardapio,
  tagDoCardapio,
  REVALIDAR_CARDAPIO_SEGUNDOS,
} from "./menu-cache";

const LINHA = {
  id: "cat-1",
  name: "Lanches",
  slug: "lanches",
  position: 0,
  items: [
    {
      id: "item-1",
      name: "X-Salada",
      description: null,
      // O Prisma devolve Decimal; o mock usa o que o Decimal tem de relevante
      // aqui, que é virar número com Number().
      price: { toString: () => "25.90", valueOf: () => 25.9 },
      imageUrl: null,
      available: true,
      categoryId: "cat-1",
      containsGluten: null,
      containsLactose: false,
      isVegan: true,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  categoryFindMany.mockResolvedValue([LINHA]);
});

describe("getCardapio", () => {
  it("usa chave e tag do próprio restaurante", async () => {
    await getCardapio("restaurante-a");

    const [, chave, opcoes] = unstableCache.mock.calls[0];
    expect(chave).toEqual(["menu", "restaurante-a"]);
    expect(opcoes).toEqual({
      revalidate: REVALIDAR_CARDAPIO_SEGUNDOS,
      tags: ["menu:restaurante-a"],
    });
  });

  it("dois restaurantes não dividem chave nem tag", async () => {
    await getCardapio("restaurante-a");
    await getCardapio("restaurante-b");

    const [a, b] = unstableCache.mock.calls;
    expect(a[1]).not.toEqual(b[1]);
    expect(a[2]).not.toEqual(b[2]);
  });

  it("revalida em uma hora, porque o que o mantém em dia é a invalidação", async () => {
    expect(REVALIDAR_CARDAPIO_SEGUNDOS).toBe(3600);
  });

  it("entrega preço como número, que é o que sobrevive ao JSON do cache", async () => {
    const [categoria] = await getCardapio("restaurante-a");
    expect(categoria.items[0].price).toBe(25.9);
    expect(typeof categoria.items[0].price).toBe("number");
  });

  it("esconde item indisponível e mantém a ordem do dono", async () => {
    await getCardapio("restaurante-a");
    const consulta = categoryFindMany.mock.calls[0][0];
    expect(consulta.orderBy).toEqual({ position: "asc" });
    expect(consulta.select.items.where).toEqual({ available: true });
    expect(consulta.select.items.orderBy).toEqual({ name: "asc" });
  });

  it("não lê colunas que nenhum consumidor usa", async () => {
    await getCardapio("restaurante-a");
    const campos = Object.keys(categoryFindMany.mock.calls[0][0].select.items.select);
    expect(campos).not.toContain("tenantId");
    expect(campos).not.toContain("createdAt");
    expect(campos).not.toContain("updatedAt");
  });

  it("propaga a falha do banco em vez de devolver vazio para o cache gravar", async () => {
    categoryFindMany.mockRejectedValue(new Error("conexão recusada"));
    await expect(getCardapio("restaurante-a")).rejects.toThrow("conexão recusada");
  });
});

describe("getCardapioOuVazio", () => {
  it("devolve o cardápio quando o banco responde", async () => {
    const categorias = await getCardapioOuVazio("restaurante-a");
    expect(categorias).toHaveLength(1);
    expect(reportarErro).not.toHaveBeenCalled();
  });

  it("degrada para vazio e avisa, sem derrubar a página", async () => {
    categoryFindMany.mockRejectedValue(new Error("conexão recusada"));

    await expect(getCardapioOuVazio("restaurante-a")).resolves.toEqual([]);
    expect(reportarErro).toHaveBeenCalledWith(
      expect.objectContaining({ origem: "cardapio/leitura", extra: { tenantId: "restaurante-a" } })
    );
  });

  it("depois de uma falha, a visita seguinte volta ao banco", async () => {
    categoryFindMany.mockRejectedValueOnce(new Error("conexão recusada"));

    await getCardapioOuVazio("restaurante-a");
    const depois = await getCardapioOuVazio("restaurante-a");

    expect(depois).toHaveLength(1);
    expect(categoryFindMany).toHaveBeenCalledTimes(2);
  });
});

describe("invalidarCardapio", () => {
  it("invalida só a tag do restaurante, e na hora", () => {
    invalidarCardapio("restaurante-a");
    expect(revalidateTag).toHaveBeenCalledWith("menu:restaurante-a", { expire: 0 });
  });

  it("a tag é a mesma que a leitura grava", () => {
    expect(tagDoCardapio("restaurante-a")).toBe("menu:restaurante-a");
  });
});

/**
 * O payload da vitrine. Cada card é prop de Client Component, serializada no
 * HTML; a página mandava a linha inteira do Prisma duas vezes por item.
 */
describe("o que vai para o navegador", () => {
  const ITEM = {
    id: "item-1",
    name: "X-Salada",
    description: "Pão, carne e salada",
    price: 25.9,
    imageUrl: "https://exemplo/x.jpg",
    available: true,
    categoryId: "cat-1",
    containsGluten: true,
    containsLactose: false,
    isVegan: null,
  };

  it("o card leva só o que o card e o modal mostram", () => {
    expect(itemParaCard(ITEM)).toEqual({
      id: "item-1",
      name: "X-Salada",
      description: "Pão, carne e salada",
      price: 25.9,
      imageUrl: "https://exemplo/x.jpg",
      available: true,
    });
  });

  it("o filtro leva as declarações e o nome da categoria, sem a descrição", () => {
    expect(itemParaFiltro(ITEM, { name: "Lanches" })).toEqual({
      id: "item-1",
      name: "X-Salada",
      price: 25.9,
      imageUrl: "https://exemplo/x.jpg",
      containsGluten: true,
      containsLactose: false,
      isVegan: null,
      category: { name: "Lanches" },
    });
  });

  it("prioridade só para os quatro primeiros da primeira categoria", () => {
    expect([0, 1, 2, 3, 4].map((i) => cardTemPrioridade(0, i))).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(cardTemPrioridade(1, 0)).toBe(false);
  });
});
