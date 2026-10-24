// @vitest-environment jsdom
/**
 * Ativar, desativar e excluir item do cardápio respondem na hora.
 *
 * A tela muda antes de o servidor confirmar, e desfaz se ele recusar. Os
 * testes cobrem as duas metades: o clique não espera nem refaz a página
 * inteira, e uma recusa (item já pedido não pode ser excluído) devolve a tela
 * ao que era, com a mensagem da rota.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) },
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./MenuItemModal", () => ({ MenuItemModal: () => null }));

import { MenuManager } from "./MenuManager";

const fetchMock = vi.fn();

function item(over: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    name: "X-Salada",
    description: null,
    price: 25,
    imageUrl: null,
    available: true,
    categoryId: "cat-1",
    ...over,
  };
}

function montar() {
  const categorias = [
    {
      id: "cat-1",
      name: "Lanches",
      slug: "lanches",
      position: 0,
      items: [item(), item({ id: "item-2", name: "X-Bacon" })],
    },
  ];
  return render(
    <MenuManager
      initialCategories={categorias}
      allCategories={[{ id: "cat-1", name: "Lanches", slug: "lanches" }]}
    />
  );
}

/** Uma resposta que só chega quando o teste mandar. */
function adiada() {
  let responder!: (r: Response) => void;
  const promessa = new Promise<Response>((r) => (responder = r));
  return { promessa, responder };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const botaoDeAtivar = (nome: "Desativar" | "Ativar") => screen.getAllByTitle(nome)[0];
const linhaDo = (nome: string) => screen.getByText(nome).closest("div.flex.items-center")!;

describe("ativar e desativar", () => {
  it("muda a tela antes de o servidor responder, e não refaz a página", async () => {
    const { promessa, responder } = adiada();
    fetchMock.mockReturnValue(promessa);
    montar();

    await userEvent.click(botaoDeAtivar("Desativar"));

    expect(linhaDo("X-Salada").className).toContain("opacity-60");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ available: false });

    responder(new Response("{}", { status: 200 }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Item desativado"));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("desfaz quando o servidor recusa", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    montar();

    await userEvent.click(botaoDeAtivar("Desativar"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Erro ao atualizar item"));
    expect(linhaDo("X-Salada").className).not.toContain("opacity-60");
  });

  it("desfaz quando a rede cai", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    montar();

    await userEvent.click(botaoDeAtivar("Desativar"));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(linhaDo("X-Salada").className).not.toContain("opacity-60");
  });
});

describe("excluir", () => {
  it("tira o item da lista na hora, e não refaz a página", async () => {
    const { promessa, responder } = adiada();
    fetchMock.mockReturnValue(promessa);
    montar();

    await userEvent.click(linhaDo("X-Salada").querySelectorAll("button")[2]);

    expect(screen.queryByText("X-Salada")).toBeNull();

    responder(new Response("{}", { status: 200 }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Item excluído"));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("devolve o item ao mesmo lugar e mostra o motivo da rota quando ela recusa", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Item já pedido. Desative em vez de excluir." }), {
        status: 409,
      })
    );
    montar();

    await userEvent.click(linhaDo("X-Salada").querySelectorAll("button")[2]);

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Item já pedido. Desative em vez de excluir.")
    );
    const nomes = screen.getAllByText(/^X-/).map((n) => n.textContent);
    expect(nomes).toEqual(["X-Salada", "X-Bacon"]);
  });

  it("não faz nada se o dono desistir na confirmação", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    montar();

    await userEvent.click(linhaDo("X-Salada").querySelectorAll("button")[2]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("X-Salada")).toBeTruthy();
  });
});
