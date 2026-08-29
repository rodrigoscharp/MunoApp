// @vitest-environment jsdom
/**
 * A gaveta do carrinho.
 *
 * É a última tela em que o cliente confere o que vai pedir antes de ir para o
 * checkout, e o único lugar onde ele consegue mudar quantidade. O que se afirma
 * aqui é a aritmética exibida (subtotal por linha e total) e o botão de menos na
 * última unidade, que vira lixeira — o caminho por onde o item sai do carrinho.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCart } from "@/hooks/useCart";
import { CartDrawer } from "./CartDrawer";

// O upsell tem fetch e Image do Next lá dentro; ele tem teste próprio.
vi.mock("@/components/cart/CartUpsell", () => ({
  CartUpsell: () => null,
}));

const onClose = vi.fn();

function popular(itens: { id: string; name: string; price: number; quantity: number; notes?: string }[]) {
  useCart.setState({ items: [] });
  itens.forEach(({ quantity, ...item }) =>
    useCart.getState().addItem({ ...item, imageUrl: null }, quantity)
  );
}

beforeEach(() => {
  onClose.mockClear();
  useCart.setState({ items: [] });
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("carrinho vazio", () => {
  it("diz que está vazio", () => {
    render(<CartDrawer open onClose={onClose} />);
    expect(screen.getByText(/carrinho está vazio/i)).toBeDefined();
  });

  it("não oferece o botão de fazer pedido", () => {
    render(<CartDrawer open onClose={onClose} />);
    expect(screen.queryByRole("link", { name: /fazer pedido/i })).toBeNull();
  });

  it("não mostra total", () => {
    render(<CartDrawer open onClose={onClose} />);
    expect(screen.queryByText(/^total$/i)).toBeNull();
  });
});

describe("com itens", () => {
  beforeEach(() => {
    popular([
      { id: "item-1", name: "X-Salada", price: 25, quantity: 2 },
      { id: "item-2", name: "Suco", price: 8, quantity: 1 },
    ]);
  });

  it("lista os itens do carrinho", () => {
    render(<CartDrawer open onClose={onClose} />);

    expect(screen.getByText("X-Salada")).toBeDefined();
    expect(screen.getByText("Suco")).toBeDefined();
  });

  it("mostra o subtotal de cada linha, preço vezes quantidade", () => {
    render(<CartDrawer open onClose={onClose} />);

    expect(screen.getByText("R$ 50,00")).toBeDefined(); // 25 × 2
    expect(screen.getAllByText("R$ 8,00").length).toBeGreaterThan(0); // 8 × 1
  });

  it("mostra o preço unitário de quem não tem observação", () => {
    render(<CartDrawer open onClose={onClose} />);
    expect(screen.getByText("R$ 25,00 cada")).toBeDefined();
  });

  it("mostra o total do carrinho", () => {
    render(<CartDrawer open onClose={onClose} />);
    expect(screen.getByText("R$ 58,00")).toBeDefined(); // 50 + 8
  });

  it("leva para o checkout", () => {
    render(<CartDrawer open onClose={onClose} />);
    const link = screen.getByRole("link", { name: /fazer pedido/i });
    expect(link.getAttribute("href")).toBe("/checkout");
  });

  it("fecha a gaveta ao seguir para o checkout", async () => {
    render(<CartDrawer open onClose={onClose} />);
    await userEvent.click(screen.getByRole("link", { name: /fazer pedido/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("mudar quantidade pela gaveta", () => {
  beforeEach(() => {
    popular([{ id: "item-1", name: "X-Salada", price: 25, quantity: 2 }]);
  });

  /** A linha do item, para achar os botões dela sem pegar os do cabeçalho. */
  function linhaDoItem() {
    return screen.getByText("X-Salada").closest("div")!.parentElement!;
  }

  it("o mais soma uma unidade e o total acompanha", async () => {
    render(<CartDrawer open onClose={onClose} />);
    const [, mais] = within(linhaDoItem()).getAllByRole("button");

    await userEvent.click(mais);

    expect(useCart.getState().items[0].quantity).toBe(3);
    // Com um item só, subtotal da linha e total do carrinho são o mesmo valor —
    // e os dois precisam ter acompanhado o clique.
    expect(screen.getAllByText("R$ 75,00")).toHaveLength(2);
  });

  it("o menos tira uma unidade", async () => {
    render(<CartDrawer open onClose={onClose} />);
    const [menos] = within(linhaDoItem()).getAllByRole("button");

    await userEvent.click(menos);

    expect(useCart.getState().items[0].quantity).toBe(1);
  });

  it("o menos na última unidade remove o item", async () => {
    popular([{ id: "item-1", name: "X-Salada", price: 25, quantity: 1 }]);
    render(<CartDrawer open onClose={onClose} />);
    const [menos] = within(linhaDoItem()).getAllByRole("button");

    await userEvent.click(menos);

    expect(useCart.getState().items).toHaveLength(0);
    expect(screen.getByText(/carrinho está vazio/i)).toBeDefined();
  });
});

describe("observação do item", () => {
  it("aparece no lugar do preço unitário", () => {
    popular([
      { id: "item-1", name: "X-Salada", price: 25, quantity: 1, notes: "sem cebola" },
    ]);
    render(<CartDrawer open onClose={onClose} />);

    expect(screen.getByText("sem cebola")).toBeDefined();
    expect(screen.queryByText("R$ 25,00 cada")).toBeNull();
  });

  it("mostra o mesmo item duas vezes quando as observações diferem", () => {
    popular([
      { id: "item-1", name: "X-Salada", price: 25, quantity: 1, notes: "sem cebola" },
      { id: "item-1", name: "X-Salada", price: 25, quantity: 1, notes: "sem tomate" },
    ]);
    render(<CartDrawer open onClose={onClose} />);

    expect(screen.getAllByText("X-Salada")).toHaveLength(2);
    expect(screen.getByText("sem cebola")).toBeDefined();
    expect(screen.getByText("sem tomate")).toBeDefined();
  });
});

describe("abrir e fechar", () => {
  beforeEach(() => {
    popular([{ id: "item-1", name: "X-Salada", price: 25, quantity: 1 }]);
  });

  it("fecha no X", async () => {
    render(<CartDrawer open onClose={onClose} />);
    const cabecalho = screen.getByText(/seu pedido/i).parentElement!;

    await userEvent.click(within(cabecalho).getByRole("button"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fecha ao clicar fora", async () => {
    const { container } = render(<CartDrawer open onClose={onClose} />);
    const backdrop = container.querySelector(".fixed.inset-0")!;

    await userEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("não renderiza o fundo escuro quando está fechada", () => {
    const { container } = render(<CartDrawer open={false} onClose={onClose} />);
    expect(container.querySelector(".fixed.inset-0")).toBeNull();
  });
});
