import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (fn: () => Promise<unknown>) => fn }));
vi.mock("@/lib/prisma", () => ({ prisma: { setting: { findUnique: vi.fn() } } }));
vi.mock("@/lib/observabilidade", () => ({ reportarErro: vi.fn(async () => {}) }));

import {
  BANNER_PADRAO,
  bannerSchema,
  chamadaDoBanner,
  diaDaSemanaEmBrasilia,
  escolherItemDoBanner,
} from "./banner";
import type { CategoriaDoCardapio } from "@/lib/menu-cache";

const item = (
  id: string,
  available = true,
  imageUrl: string | null = null,
  imagemRecortadaUrl: string | null = null
) => ({
  id,
  name: id,
  description: null,
  price: 10,
  imageUrl,
  imagemRecortadaUrl,
  available,
  categoryId: "c",
  containsGluten: null,
  containsLactose: null,
  isVegan: null,
});
const menu = (itens: ReturnType<typeof item>[]): CategoriaDoCardapio[] => [
  { id: "c", name: "Lanches", slug: "lanches", position: 0, items: itens },
];

describe("qual item vai no banner", () => {
  it("por padrão, o mais vendido", () => {
    const r = escolherItemDoBanner(BANNER_PADRAO, menu([item("a"), item("b")]), [item("b")]);
    expect(r).toMatchObject({ item: { id: "b" }, modo: "mais-vendido" });
  });

  it("no modo item, o escolhido pelo dono", () => {
    const config = { modo: "item" as const, itemId: "a", chamada: "Lançamento" };
    const r = escolherItemDoBanner(config, menu([item("a"), item("b")]), [item("b")]);
    expect(r).toMatchObject({ item: { id: "a" }, modo: "item" });
  });

  it("escolhido esgotado ou apagado volta sozinho ao mais vendido", () => {
    const config = { modo: "item" as const, itemId: "a", chamada: "" };
    expect(escolherItemDoBanner(config, menu([item("a", false), item("b")]), [item("b")])).toMatchObject({
      item: { id: "b" },
      modo: "mais-vendido",
    });
    expect(escolherItemDoBanner(config, menu([item("b")]), [item("b")])?.item.id).toBe("b");
  });

  it("sem venda nenhuma, banner de destaque da casa, nunca 'o mais pedido'", () => {
    // A fileira é completada com itens sem venda; o banner recebe só os vendidos.
    const r = escolherItemDoBanner(
      BANNER_PADRAO,
      menu([item("a"), item("b", true, "/b.jpg"), item("c", true, "/c.jpg", "/c-recorte.png")]),
      []
    );
    expect(r).toMatchObject({ item: { id: "c" }, modo: "destaque" });
    expect(escolherItemDoBanner(BANNER_PADRAO, menu([item("a"), item("b", true, "/b.jpg")]), [])).toMatchObject({
      item: { id: "b" },
      modo: "destaque",
    });
    expect(escolherItemDoBanner(BANNER_PADRAO, menu([item("a", false), item("z")]), [])?.item.id).toBe("z");
  });

  it("escolhido esgotado e nada vendido: destaque da casa", () => {
    const config = { modo: "item" as const, itemId: "a", chamada: "Lançamento" };
    expect(escolherItemDoBanner(config, menu([item("a", false), item("b")]), [])).toMatchObject({
      item: { id: "b" },
      modo: "destaque",
    });
  });

  it("sem item nenhum, sem banner", () => {
    expect(escolherItemDoBanner(BANNER_PADRAO, menu([]), [])).toBeNull();
  });
});

describe("o texto do banner", () => {
  it("usa o dia de Brasília, não o do servidor", () => {
    // 01:00 UTC de sábado = 22:00 de sexta em São Paulo.
    expect(diaDaSemanaEmBrasilia(new Date("2026-10-31T01:00:00Z"))).toBe("SEXTA");
    expect(diaDaSemanaEmBrasilia(new Date("2026-10-31T15:00:00Z"))).toBe("SÁBADO");
  });

  it("mais vendido: dia e 'o mais pedido'", () => {
    expect(chamadaDoBanner(BANNER_PADRAO, "mais-vendido", new Date("2026-10-30T15:00:00Z"))).toBe(
      "SEXTA · O MAIS PEDIDO"
    );
  });

  it("item escolhido: dia e a chamada do dono, ou 'destaque da casa'", () => {
    const sexta = new Date("2026-10-30T15:00:00Z");
    expect(chamadaDoBanner({ modo: "item", itemId: "a", chamada: "Lançamento" }, "item", sexta)).toBe(
      "SEXTA · LANÇAMENTO"
    );
    expect(chamadaDoBanner({ modo: "item", itemId: "a", chamada: "" }, "item", sexta)).toBe(
      "SEXTA · DESTAQUE DA CASA"
    );
  });

  it("o item escolhido caiu para o mais vendido: a chamada do dono não sai junto", () => {
    const sexta = new Date("2026-10-30T15:00:00Z");
    expect(chamadaDoBanner({ modo: "item", itemId: "a", chamada: "Lançamento" }, "mais-vendido", sexta)).toBe(
      "SEXTA · O MAIS PEDIDO"
    );
  });

  it("destaque sem venda: não diz 'o mais pedido', nem leva a chamada do dono", () => {
    const sexta = new Date("2026-10-30T15:00:00Z");
    expect(chamadaDoBanner(BANNER_PADRAO, "destaque", sexta)).toBe("SEXTA · DESTAQUE DA CASA");
    expect(chamadaDoBanner({ modo: "item", itemId: "a", chamada: "Lançamento" }, "destaque", sexta)).toBe(
      "SEXTA · DESTAQUE DA CASA"
    );
  });

  it("chamada longa é recusada", () => {
    expect(bannerSchema.safeParse({ modo: "item", itemId: "a", chamada: "x".repeat(25) }).success).toBe(false);
  });
});
