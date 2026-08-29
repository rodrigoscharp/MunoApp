// @vitest-environment jsdom
/**
 * O "que tal adicionar?" dentro do carrinho.
 *
 * A regra de escolha é do `getUpsellSuggestions`, que tem teste próprio. O que
 * se afirma aqui é a costura: quando o bloco aparece, quando ele some, e o que
 * o botão de mais realmente coloca no carrinho — preço incluído, porque é o que
 * o cliente vai ver somado no total um instante depois.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCart } from "@/hooks/useCart";
import { CartUpsell } from "./CartUpsell";

// next/image exige configuração de loader que não é assunto deste teste. O
// <img> cru é o ponto do dublê, então a regra do Next não se aplica aqui.
vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

const fetchMock = vi.fn();

const cardapio = [
  {
    id: "cat-lanches",
    name: "Lanches",
    items: [
      { id: "item-1", name: "X-Salada", price: 25, available: true, imageUrl: null },
    ],
  },
  {
    id: "cat-bebidas",
    name: "Bebidas",
    items: [
      { id: "bebida-cara", name: "Suco Premium", price: 15, available: true, imageUrl: null },
      { id: "bebida-barata", name: "Água", price: 5, available: true, imageUrl: null },
    ],
  },
];

function respondeCom(data: unknown, ok = true) {
  fetchMock.mockResolvedValue({ ok, statusText: ok ? "OK" : "Erro", json: async () => data });
}

function comItemNoCarrinho(id = "item-1") {
  useCart.setState({ items: [] });
  useCart.getState().addItem({ id, name: "X-Salada", price: 25, imageUrl: null }, 1);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  useCart.setState({ items: [] });
  localStorage.clear();
  respondeCom(cardapio);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("quando o bloco não aparece", () => {
  it("some com o carrinho vazio", async () => {
    render(<CartUpsell />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(screen.queryByText(/que tal adicionar/i)).toBeNull();
  });

  it("some enquanto o cardápio não chegou", () => {
    comItemNoCarrinho();
    fetchMock.mockReturnValue(new Promise(() => {})); // nunca resolve

    render(<CartUpsell />);

    expect(screen.queryByText(/que tal adicionar/i)).toBeNull();
  });

  it("some quando a busca do cardápio falha", async () => {
    comItemNoCarrinho();
    respondeCom(null, false);

    render(<CartUpsell />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(screen.queryByText(/que tal adicionar/i)).toBeNull();
  });

  it("some quando a rede cai", async () => {
    comItemNoCarrinho();
    fetchMock.mockRejectedValue(new Error("offline"));

    render(<CartUpsell />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(screen.queryByText(/que tal adicionar/i)).toBeNull();
  });

  it("some quando não sobra categoria para sugerir", async () => {
    // Carrinho com item de cada categoria: nada a oferecer.
    useCart.setState({ items: [] });
    useCart.getState().addItem({ id: "item-1", name: "X", price: 25, imageUrl: null }, 1);
    useCart.getState().addItem({ id: "bebida-barata", name: "Água", price: 5, imageUrl: null }, 1);

    render(<CartUpsell />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(screen.queryByText(/que tal adicionar/i)).toBeNull();
  });
});

describe("quando o bloco aparece", () => {
  beforeEach(() => {
    comItemNoCarrinho();
  });

  it("busca o cardápio do restaurante", async () => {
    render(<CartUpsell />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/menu"));
  });

  it("oferece o item mais barato da categoria intocada", async () => {
    render(<CartUpsell />);

    expect(await screen.findByText("Água")).toBeDefined();
    expect(screen.queryByText("Suco Premium")).toBeNull();
  });

  it("não oferece nada da categoria que já está no carrinho", async () => {
    render(<CartUpsell />);
    await screen.findByText(/que tal adicionar/i);

    expect(screen.queryByText("X-Salada")).toBeNull();
  });

  it("mostra o preço da sugestão", async () => {
    render(<CartUpsell />);
    expect(await screen.findByText("R$ 5,00")).toBeDefined();
  });
});

describe("adicionar pela sugestão", () => {
  beforeEach(() => {
    comItemNoCarrinho();
  });

  it("põe o item no carrinho com o preço do cardápio", async () => {
    render(<CartUpsell />);
    await userEvent.click(await screen.findByRole("button", { name: /adicionar água/i }));

    const adicionado = useCart.getState().items.find((i) => i.id === "bebida-barata");
    expect(adicionado).toMatchObject({ name: "Água", price: 5, quantity: 1 });
  });

  it("soma no total do carrinho", async () => {
    render(<CartUpsell />);
    await userEvent.click(await screen.findByRole("button", { name: /adicionar água/i }));

    expect(useCart.getState().total()).toBe(30); // 25 + 5
  });

  it("o bloco some depois que a categoria sugerida entra no carrinho", async () => {
    render(<CartUpsell />);
    await userEvent.click(await screen.findByRole("button", { name: /adicionar água/i }));

    await waitFor(() =>
      expect(screen.queryByText(/que tal adicionar/i)).toBeNull()
    );
  });

  it("não busca o cardápio de novo a cada mudança do carrinho", async () => {
    render(<CartUpsell />);
    await userEvent.click(await screen.findByRole("button", { name: /adicionar água/i }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
