/**
 * O que a Vitrine entrega às ilhas de cliente. O payload do RSC serializa uma
 * vez cada objeto e referencia as repetições; quando cada ponto (busca,
 * banner, fileira, seções) montava o próprio card com itemParaCard, o cardápio
 * inteiro ia três vezes para o navegador. O teste confere que é o MESMO
 * objeto em todos, e que ele só tem os campos que o card lê.
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/observabilidade", () => ({ reportarErro: vi.fn(async () => {}) }));

const recebido = vi.hoisted(() => ({
  busca: [] as unknown[],
  fileira: [] as unknown[],
  banner: [] as unknown[],
  secoes: [] as unknown[],
}));

vi.mock("@/components/loja/BuscaNoCardapio", () => ({
  BuscaNoCardapio: ({ itens }: { itens: unknown[] }) => {
    recebido.busca = itens;
    return null;
  },
}));
vi.mock("@/components/loja/MaisPedidos", () => ({
  MaisPedidos: ({ itens }: { itens: unknown[] }) => {
    recebido.fileira = itens;
    return null;
  },
}));
vi.mock("@/components/loja/BannerDestaque", () => ({
  BannerDestaque: ({ item }: { item: unknown }) => {
    recebido.banner.push(item);
    return null;
  },
}));
vi.mock("@/components/menu/ProductCard", () => ({
  ProductCard: ({ item }: { item: unknown }) => {
    recebido.secoes.push(item);
    return null;
  },
}));
vi.mock("@/components/menu/CategoryNav", () => ({ CategoryNav: () => null }));
vi.mock("@/components/loja/CardCupom", () => ({ CardCupom: () => null }));
vi.mock("@/components/loja/FolhaDoProduto", () => ({
  ProvedorDaFolha: ({ children }: { children: React.ReactNode }) => children,
}));

import { Vitrine } from "./Vitrine";
import type { CategoriaDoCardapio } from "@/lib/menu-cache";

const item = (id: string, imageUrl: string | null = null) => ({
  id,
  name: `Item ${id}`,
  description: "desc",
  price: 10,
  imageUrl,
  imagemRecortadaUrl: null,
  available: true,
  categoryId: "c",
  containsGluten: true,
  containsLactose: false,
  isVegan: null,
});

const CATEGORIAS: CategoriaDoCardapio[] = [
  { id: "c1", name: "Lanches", slug: "lanches", position: 0, items: [item("a", "/a.jpg"), item("b")] },
  { id: "c2", name: "Bebidas", slug: "bebidas", position: 1, items: [item("c")] },
];

describe("Vitrine", () => {
  it("busca, banner, fileira e seções recebem o mesmo objeto de cada item", () => {
    renderToStaticMarkup(<Vitrine categorias={CATEGORIAS} idsMaisPedidos={["b"]} restaurantOpen />);

    expect(recebido.busca).toHaveLength(3);
    const porId = new Map((recebido.busca as { id: string }[]).map((c) => [c.id, c]));
    for (const c of recebido.secoes as { id: string }[]) expect(c).toBe(porId.get(c.id));
    for (const c of recebido.fileira as { id: string }[]) expect(c).toBe(porId.get(c.id));
    const [doBanner] = recebido.banner as { id: string }[];
    expect(doBanner.id).toBe("b");
    expect(doBanner).toBe(porId.get("b"));
  });

  it("a busca recebe só os campos que o card lê", () => {
    renderToStaticMarkup(<Vitrine categorias={CATEGORIAS} idsMaisPedidos={[]} restaurantOpen />);
    for (const c of recebido.busca as object[]) {
      expect(Object.keys(c).sort()).toEqual(["available", "description", "id", "imageUrl", "name", "price"]);
    }
  });
});
