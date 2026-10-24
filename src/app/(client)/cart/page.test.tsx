// @vitest-environment jsdom
/**
 * A página /cart.
 *
 * O store indexa as linhas por `cartId` (item + observação), e a página
 * passava `item.id`: os botões de mais e de menos não achavam linha nenhuma e
 * não faziam nada.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCart } from "@/hooks/useCart";

vi.mock("@/components/cart/CartUpsell", () => ({ CartUpsell: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import CartPage from "./page";

beforeEach(() => {
  localStorage.clear();
  useCart.setState({ items: [] });
  useCart.getState().addItem({ id: "item-1", name: "X-Salada", price: 25, imageUrl: null, notes: "sem cebola" }, 2);
});

afterEach(cleanup);

function botoes() {
  // Os dois botões da linha, na ordem em que aparecem: menos, depois mais.
  return screen.getAllByRole("button").filter((b) => !/limpar/i.test(b.textContent ?? ""));
}

describe("CartPage", () => {
  it("o botão de mais soma uma unidade", async () => {
    render(<CartPage />);
    await userEvent.click(botoes()[1]);
    expect(useCart.getState().items[0].quantity).toBe(3);
  });

  it("o botão de menos tira uma unidade", async () => {
    render(<CartPage />);
    await userEvent.click(botoes()[0]);
    expect(useCart.getState().items[0].quantity).toBe(1);
  });

  it("separa as linhas do mesmo item com observações diferentes", () => {
    useCart.getState().addItem({ id: "item-1", name: "X-Salada", price: 25, imageUrl: null }, 1);
    render(<CartPage />);
    expect(screen.getAllByText("X-Salada")).toHaveLength(2);
  });
});
