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

describe("a validação da entrega", () => {
  // Bairro, rua, número e telefone eram conferidos só no submit, e o erro
  // aparecia num bloco no fim da página, longe do campo. Agora é o schema que
  // decide, e cada erro aparece ao lado do seu campo.
  async function entregaSemDados() {
    render(<CheckoutPage />);
    fireEvent.click(await screen.findByRole("button", { name: /entrega/i }));
    await screen.findByRole("option", { name: "Centro" });
    fireEvent.change(screen.getByPlaceholderText("(11) 99999-9999"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar pedido/i }));
  }

  it("aponta cada campo que falta, ao lado dele", async () => {
    await entregaSemDados();

    await screen.findByText("Selecione o bairro de entrega.");
    screen.getByText("Informe a rua.");
    screen.getByText("Informe o número.");
    screen.getByText("Informe um telefone para contato na entrega.");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/orders", expect.anything());
  });

  it("retirada não pede endereço nem telefone", async () => {
    render(<CheckoutPage />);
    await screen.findByText("Finalizar Pedido");
    fireEvent.click(screen.getByRole("button", { name: /confirmar pedido/i }));

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/orders", expect.anything())
    );
    expect(screen.queryByText("Informe a rua.")).toBeNull();
  });
});

describe("quando o servidor recusa o pedido", () => {
  async function confirmarRetirada() {
    render(<CheckoutPage />);
    await screen.findByText("Finalizar Pedido");
    fireEvent.click(screen.getByRole("button", { name: /confirmar pedido/i }));
  }

  it("issue do zod vira erro no campo, e nada de JSON na tela", async () => {
    pedido = () =>
      respostaJson(
        { error: [{ code: "too_big", path: ["customerPhone"], message: "Too big: expected string" }] },
        400
      );
    await confirmarRetirada();

    await screen.findByText("Confira o telefone.");
    screen.getByText("Confira os campos destacados.");
    expect(document.body.textContent).not.toMatch(/too_big|Too big|\[\{/);
  });

  it("item indisponível sai do carrinho e o cliente fica sabendo qual", async () => {
    useCart.getState().addItem({ id: "item-2", name: "Suco", price: 8, imageUrl: null }, 1);
    pedido = () =>
      respostaJson(
        { error: "Um ou mais itens do carrinho não estão mais disponíveis.", indisponiveis: ["item-1"] },
        422
      );
    await confirmarRetirada();

    await screen.findByText(/X-Salada não está mais disponível e saiu do seu carrinho/);
    expect(useCart.getState().items.map((i) => i.id)).toEqual(["item-2"]);
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("se o carrinho esvaziar, o aviso continua na tela", async () => {
    pedido = () =>
      respostaJson({ error: "Um ou mais itens...", indisponiveis: ["item-1"] }, 422);
    await confirmarRetirada();

    await screen.findByText(/seu carrinho está vazio/i);
    screen.getByText(/X-Salada não está mais disponível/);
  });
});
