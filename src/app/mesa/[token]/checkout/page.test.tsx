// @vitest-environment jsdom
/**
 * O checkout da mesa.
 *
 * O pedido de mesa não tem conta nem endereço: o que diz para onde a comida vai
 * é o `tableId`. Se ele sair errado, o prato chega na mesa de outra pessoa e a
 * conta soma num nome que não pediu. O teste central é o da aba que já leu o QR
 * de uma mesa e depois lê o de outra.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCart } from "@/hooks/useCart";

const nav = vi.hoisted(() => ({ push: vi.fn(), token: "token-8" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ token: nav.token }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import MesaCheckoutPage from "./page";

const fetchMock = vi.fn();

function respostaJson(corpo: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } })
  );
}

function pedidoEnviado() {
  const chamada = fetchMock.mock.calls.find(([url]) => url === "/api/orders");
  return chamada ? JSON.parse(chamada[1].body) : undefined;
}

async function confirmar() {
  await userEvent.type(screen.getByPlaceholderText("Seu nome"), "Ana");
  const botao = await screen.findByRole("button", { name: /confirmar pedido/i });
  await waitFor(() => expect((botao as HTMLButtonElement).disabled).toBe(false));
  await userEvent.click(botao);
}

beforeEach(() => {
  nav.push.mockClear();
  nav.token = "token-8";
  sessionStorage.clear();
  localStorage.clear();
  useCart.setState({ items: [] });
  useCart.getState().addItem({ id: "item-1", name: "X-Salada", price: 25, imageUrl: null }, 1);
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) => {
    if (url === "/api/tables/token/token-8") {
      return respostaJson({ id: "id-8", number: 8, name: null, token: "token-8" });
    }
    if (url === "/api/orders") return respostaJson({ id: "pedido-1" }, 201);
    return respostaJson({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a mesa do pedido", () => {
  it("usa a mesa do token da URL, não a que ficou guardada de outro QR", async () => {
    sessionStorage.setItem(
      "muno-table",
      JSON.stringify({ tableId: "id-3", tableNumber: 3, tableName: null, tableToken: "token-3" })
    );

    render(<MesaCheckoutPage />);
    await confirmar();

    await waitFor(() => expect(pedidoEnviado()).toBeDefined());
    expect(pedidoEnviado().tableId).toBe("id-8");
    expect(nav.push).toHaveBeenCalledWith("/mesa/token-8/pedido/pedido-1");
  });

  it("aproveita a mesa guardada quando ela é a do token", async () => {
    sessionStorage.setItem(
      "muno-table",
      JSON.stringify({ tableId: "id-8", tableNumber: 8, tableName: null, tableToken: "token-8" })
    );

    render(<MesaCheckoutPage />);
    await confirmar();

    await waitFor(() => expect(pedidoEnviado()).toBeDefined());
    expect(pedidoEnviado().tableId).toBe("id-8");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/tables/token/token-8");
  });

  it("não envia o pedido sem mesa quando o token não resolve", async () => {
    fetchMock.mockImplementation(() => respostaJson({ error: "Mesa não encontrada" }, 404));

    render(<MesaCheckoutPage />);

    await screen.findByText(/não conseguimos identificar a mesa/i);
    expect((screen.getByRole("button", { name: /confirmar pedido/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(pedidoEnviado()).toBeUndefined();
  });
});
