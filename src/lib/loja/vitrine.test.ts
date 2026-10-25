import { beforeEach, describe, expect, it, vi } from "vitest";

const { groupBy, findFirst } = vi.hoisted(() => ({ groupBy: vi.fn(), findFirst: vi.fn() }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { orderItem: { groupBy }, coupon: { findFirst } },
}));
vi.mock("@/lib/observabilidade", () => ({ reportarErro: vi.fn(async () => {}) }));

import {
  beneficioDoCupom,
  escolherMaisPedidos,
  getCupomEmDestaque,
  getMaisPedidos,
  getMaisPedidosOuVazio,
} from "./vitrine";
import type { CategoriaDoCardapio } from "@/lib/menu-cache";

const item = (id: string, imageUrl: string | null = null, available = true) => ({
  id,
  name: id,
  description: null,
  price: 10,
  imageUrl,
  imagemRecortadaUrl: null,
  available,
  categoryId: "c",
  containsGluten: null,
  containsLactose: null,
  isVegan: null,
});
const cardapio = (itens: ReturnType<typeof item>[]): CategoriaDoCardapio[] => [
  { id: "c", name: "Lanches", slug: "lanches", position: 0, items: itens },
];

beforeEach(() => vi.clearAllMocks());

describe("mais pedidos", () => {
  it("lê os últimos 30 dias, sem cancelados, do mais vendido para o menos", async () => {
    groupBy.mockResolvedValue([{ menuItemId: "b" }, { menuItemId: "a" }]);
    expect(await getMaisPedidos("t1")).toEqual(["b", "a"]);
    const args = groupBy.mock.calls[0][0];
    expect(args.where.order.status).toEqual({ not: "CANCELLED" });
    expect(args.orderBy).toEqual({ _sum: { quantity: "desc" } });
    const desde: Date = args.where.order.createdAt.gte;
    const dias = (Date.now() - desde.getTime()) / 86_400_000;
    expect(Math.round(dias)).toBe(30);
  });

  it("falha de banco vira fileira vazia, sem derrubar o cardápio", async () => {
    groupBy.mockRejectedValue(new Error("banco fora"));
    expect(await getMaisPedidosOuVazio("t1")).toEqual([]);
  });

  it("cruza com o cardápio: indisponível sai, a ordem de venda fica", () => {
    const menu = cardapio([item("a"), item("b"), item("c", null, false)]);
    expect(escolherMaisPedidos(menu, ["c", "b", "x", "a"]).map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("poucos vendidos: completa a fileira com os outros, com foto primeiro", () => {
    const menu = cardapio([item("a"), item("b", "/b.jpg"), item("c"), item("d", "/d.jpg")]);
    expect(escolherMaisPedidos(menu, ["c"]).map((i) => i.id)).toEqual(["c", "b", "d", "a"]);
    expect(escolherMaisPedidos(menu, ["c"], 2).map((i) => i.id)).toEqual(["c", "b"]);
  });

  it("sem histórico, os itens com foto na frente e os sem foto no fim", () => {
    const comFoto = cardapio([item("a"), item("b", "/b.jpg"), item("c", "/c.jpg")]);
    expect(escolherMaisPedidos(comFoto, []).map((i) => i.id)).toEqual(["b", "c", "a"]);
    const semFoto = cardapio([item("a"), item("b")]);
    expect(escolherMaisPedidos(semFoto, []).map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("cupom em destaque", () => {
  it("só procura cupom marcado, ativo e dentro da validade", async () => {
    findFirst.mockResolvedValue({ code: "BEMVINDO", type: "PERCENT", value: 10, minOrder: 0 });
    expect(await getCupomEmDestaque("t1")).toEqual({ code: "BEMVINDO", beneficio: "10% off" });
    const where = findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ destaque: true, active: true });
    expect(JSON.stringify(where.AND)).toContain("validFrom");
    expect(JSON.stringify(where.AND)).toContain("validUntil");
  });

  it("sem cupom marcado, nada", async () => {
    findFirst.mockResolvedValue(null);
    expect(await getCupomEmDestaque("t1")).toBeNull();
  });

  it("descreve o benefício de cada tipo", () => {
    expect(beneficioDoCupom({ type: "PERCENT", value: 15, minOrder: 0 })).toBe("15% off");
    expect(beneficioDoCupom({ type: "FIXED", value: 5, minOrder: 30 })).toMatch(/^R\$\s5,00 off acima de R\$\s30,00$/);
    expect(beneficioDoCupom({ type: "FREE_SHIPPING", value: 0, minOrder: 0 })).toBe("Entrega grátis");
  });
});
