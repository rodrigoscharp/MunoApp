// @vitest-environment jsdom
/**
 * O checkout do delivery.
 *
 * É a tela onde o cliente decide pagar, e quase tudo que dá errado aqui é
 * silencioso: carrinho que parece vazio antes de o localStorage ser lido,
 * bairro que "carrega" para sempre, erro em JSON. Cada bloco abaixo trava um
 * desses.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { useCart } from "@/hooks/useCart";

const nav = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "Ana" } }, status: "authenticated" }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import CheckoutPage from "./page";

const fetchMock = vi.fn();

function respostaJson(corpo: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } })
  );
}

let zonas: () => Promise<Response>;
let pedido: () => Promise<Response>;

beforeEach(() => {
  nav.push.mockClear();
  localStorage.clear();
  useCart.setState({ items: [] });
  useCart.getState().addItem({ id: "item-1", name: "X-Salada", price: 25, imageUrl: null }, 1);
  zonas = () => respostaJson([{ id: "z1", name: "Centro", price: "5" }]);
  pedido = () => respostaJson({ id: "pedido-1" }, 201);
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) => {
    if (url === "/api/payments/methods") {
      return respostaJson({ methods: ["CASH"], requiresPayerDocument: false });
    }
    if (url === "/api/delivery-zones") return zonas();
    if (url === "/api/orders") return pedido();
    return respostaJson({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("antes de o carrinho ser lido do navegador", () => {
  it("não mostra carrinho vazio enquanto o persist não hidratou", async () => {
    // Antes da hidratação o store está com o estado inicial, vazio, como no
    // HTML que veio do servidor. O carrinho guardado chega quando ela termina.
    const guardado = useCart.getState().items;
    useCart.setState({ items: [] });
    let terminar: (() => void) | undefined;
    vi.spyOn(useCart.persist, "hasHydrated").mockReturnValue(false);
    vi.spyOn(useCart.persist, "onFinishHydration").mockImplementation((cb) => {
      terminar = () => {
        useCart.setState({ items: guardado });
        cb(useCart.getState());
      };
      return () => {};
    });

    render(<CheckoutPage />);
    expect(screen.queryByText(/seu carrinho está vazio/i)).toBeNull();
    screen.getByText(/carregando seu pedido/i);

    vi.mocked(useCart.persist.hasHydrated).mockReturnValue(true);
    act(() => terminar?.());
    await screen.findByText("Finalizar Pedido");
  });

  it("depois de hidratar, carrinho vazio é vazio", async () => {
    useCart.setState({ items: [] });
    render(<CheckoutPage />);
    await screen.findByText(/seu carrinho está vazio/i);
  });
});

describe("os bairros de entrega", () => {
  it("falha ao buscar vira aviso com nova tentativa, não carregamento eterno", async () => {
    zonas = () => respostaJson({ error: "x" }, 500);
    render(<CheckoutPage />);

    fireEvent.click(await screen.findByRole("button", { name: /entrega/i }));
    await screen.findByText(/não conseguimos carregar os bairros/i);
    expect(screen.queryByText(/carregando bairros/i)).toBeNull();

    zonas = () => respostaJson([{ id: "z1", name: "Centro", price: "5" }]);
    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    await screen.findByRole("option", { name: "Centro" });
  });

  it("rede caída também vira aviso", async () => {
    zonas = () => Promise.reject(new TypeError("Failed to fetch"));
    render(<CheckoutPage />);

    fireEvent.click(await screen.findByRole("button", { name: /entrega/i }));
    await screen.findByText(/não conseguimos carregar os bairros/i);
  });

  it("sem bairro cadastrado, a entrega fica desligada e diz por quê", async () => {
    zonas = () => respostaJson([]);
    render(<CheckoutPage />);

    await screen.findByText(/não está fazendo entregas pelo app/i);
    const entrega = screen.getByRole("button", { name: /entrega/i }) as HTMLButtonElement;
    expect(entrega.disabled).toBe(true);
  });

  it("com bairros, lista para escolher", async () => {
    render(<CheckoutPage />);
    fireEvent.click(await screen.findByRole("button", { name: /entrega/i }));
    await screen.findByRole("option", { name: "Centro" });
  });
});
