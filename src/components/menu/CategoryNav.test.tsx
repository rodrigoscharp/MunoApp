// @vitest-environment jsdom
/**
 * As âncoras da loja. O slug da categoria é texto livre, e a seção usava o
 * slug cru como id: uma categoria "Mais pedidos" ou "Cardápio" repetia o id
 * de uma âncora fixa, e o "Top" ou a barra de baixo levavam ao lugar errado.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/menu/CartFlyAnimation", () => ({ triggerCartFly: vi.fn() }));

import { CategoryNav } from "./CategoryNav";
import { SecoesDoCardapio } from "@/components/loja/SecoesDoCardapio";
import { MaisPedidos } from "@/components/loja/MaisPedidos";
import { ANCORA_DO_CARDAPIO, ANCORA_DOS_MAIS_PEDIDOS, idDaSecao, secaoDoHashAntigo } from "@/lib/loja/ancoras";
import type { CategoriaDoCardapio } from "@/lib/menu-cache";

const item = (id: string) => ({
  id,
  name: `Item ${id}`,
  description: null,
  price: 10,
  imageUrl: null,
  imagemRecortadaUrl: null,
  available: true,
  categoryId: "c",
  containsGluten: null,
  containsLactose: null,
  isVegan: null,
});

// Os dois slugs que um dono pode muito bem escolher.
const CATEGORIAS: CategoriaDoCardapio[] = [
  { id: "c1", name: "Mais pedidos", slug: "mais-pedidos", position: 0, items: [item("a")] },
  { id: "c2", name: "Cardápio", slug: "cardapio", position: 1, items: [item("b")] },
];

const scrollTo = vi.fn();

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  scrollTo.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

function pagina() {
  return render(
    <>
      <CategoryNav categories={CATEGORIAS} comMaisPedidos />
      <MaisPedidos itens={[item("a")]} restaurantOpen />
      <SecoesDoCardapio categorias={CATEGORIAS} restaurantOpen />
    </>
  );
}

describe("âncoras da loja", () => {
  it("nenhum id se repete, nem com slug igual a uma âncora fixa", () => {
    const { container } = pagina();
    const ids = [...container.querySelectorAll("[id]")].map((e) => e.id);
    expect(ids.length).toBe(new Set(ids).size);
    // As fixas continuam onde estavam, uma vez só.
    expect(container.querySelectorAll(`#${ANCORA_DO_CARDAPIO}`)).toHaveLength(1);
    expect(container.querySelector(`#${ANCORA_DOS_MAIS_PEDIDOS}`)?.tagName).toBe("SECTION");
    expect(container.querySelector(`#${ANCORA_DOS_MAIS_PEDIDOS} h2`)?.textContent).toBe("Mais pedidos");
  });

  it("o bloco da categoria leva à seção dela, e não à âncora fixa de mesmo nome", async () => {
    const { container } = pagina();
    const secao = container.querySelector<HTMLElement>(`#${idDaSecao("mais-pedidos")}`)!;
    const espiao = vi.spyOn(document, "getElementById");
    // O "Top" se chama "Top"; o bloco com o nome é o da categoria.
    await userEvent.click(screen.getByRole("button", { name: "Mais pedidos" }));
    expect(espiao).toHaveBeenLastCalledWith(idDaSecao("mais-pedidos"));
    expect(espiao.mock.results.at(-1)?.value).toBe(secao);
  });

  it("link antigo com o slug cru ainda leva à seção", () => {
    expect(secaoDoHashAntigo("#lanches")).toBe("cat-lanches");
    expect(secaoDoHashAntigo("#cardapio")).toBeNull();
    expect(secaoDoHashAntigo("#%E0%A4%A")).toBeNull();
    window.location.hash = "#cardapio-x";
    render(
      <>
        <CategoryNav categories={[{ id: "x", name: "X", slug: "cardapio-x" }]} />
        <section id={idDaSecao("cardapio-x")} />
      </>
    );
    expect(scrollTo).toHaveBeenCalled();
  });
});
