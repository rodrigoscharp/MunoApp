// @vitest-environment jsdom
/**
 * A barra de baixo do celular.
 *
 * O que ela promete de relance: quantos itens há na sacola, em que aba o
 * cliente está, e para onde o Perfil leva quem ainda não entrou. Os três são
 * lidos por leitor de tela pelo mesmo caminho (rótulo e aria-current), então é
 * por eles que o teste pergunta.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const caminho = vi.fn(() => "/");
const sessao = vi.fn<() => { data: unknown }>(() => ({ data: null }));

vi.mock("next/navigation", () => ({ usePathname: () => caminho() }));
vi.mock("next-auth/react", () => ({ useSession: () => sessao(), signOut: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));

import { BarraInferior } from "./BarraInferior";
import { useCart } from "@/hooks/useCart";
import { useSacola } from "./sacola";

function comItens(...quantidades: number[]) {
  useCart.setState({
    items: quantidades.map((quantity, i) => ({
      cartId: `item-${i}::`,
      id: `item-${i}`,
      name: `Item ${i}`,
      price: 10,
      imageUrl: null,
      quantity,
    })),
  });
}

beforeEach(() => {
  caminho.mockReturnValue("/");
  sessao.mockReturnValue({ data: null });
  useCart.setState({ items: [] });
  useSacola.setState({ aberta: false, montada: false });
});

afterEach(() => {
  cleanup();
});

const barra = () => screen.getByRole("navigation", { name: "Navegação principal" });

describe("a sacola", () => {
  it("mostra a soma das quantidades, não o número de linhas", () => {
    comItens(2, 1);
    render(<BarraInferior />);

    const sacola = within(barra()).getByRole("button", { name: "Sacola, 3 itens" });
    expect(within(sacola).getByText("3")).toBeDefined();
  });

  it("sem item não mostra contagem", () => {
    render(<BarraInferior />);

    const sacola = within(barra()).getByRole("button", { name: "Sacola vazia" });
    expect(within(sacola).queryByText(/\d/)).toBeNull();
  });

  it("para de contar em 9+", () => {
    comItens(12);
    render(<BarraInferior />);

    expect(within(barra()).getByText("9+")).toBeDefined();
  });

  it("abre a gaveta da sacola", async () => {
    comItens(1);
    render(<BarraInferior />);

    await userEvent.click(within(barra()).getByRole("button", { name: "Sacola, 1 item" }));
    expect(useSacola.getState().aberta).toBe(true);
  });
});

describe("a aba atual", () => {
  it("na loja, Início é a página atual", () => {
    render(<BarraInferior />);

    expect(screen.getByRole("link", { name: "Início" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Pedidos" }).getAttribute("aria-current")).toBeNull();
  });

  it("em /pedidos, Pedidos é a página atual", () => {
    caminho.mockReturnValue("/pedidos");
    render(<BarraInferior />);

    expect(screen.getByRole("link", { name: "Pedidos" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Início" }).getAttribute("aria-current")).toBeNull();
  });

  it("some no checkout, que tem o próprio botão no rodapé", () => {
    caminho.mockReturnValue("/checkout");
    render(<BarraInferior />);

    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("o Perfil", () => {
  it("sem sessão leva ao login", () => {
    render(<BarraInferior />);

    expect(screen.getByRole("link", { name: "Perfil" }).getAttribute("href")).toBe("/login");
  });

  it("com sessão abre a conta, e a equipe encontra Admin e Cozinha ali", async () => {
    sessao.mockReturnValue({
      data: { user: { name: "Ana", email: "ana@x.com", role: "ADMIN" } },
    });
    render(<BarraInferior />);

    expect(screen.queryByRole("link", { name: "Perfil" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Perfil" }));

    const conta = screen.getByRole("dialog", { name: "Sua conta" });
    expect(within(conta).getByRole("link", { name: /admin/i }).getAttribute("href")).toBe("/adm");
    expect(within(conta).getByRole("link", { name: /cozinha/i }).getAttribute("href")).toBe("/dashboard");
  });

  it("cliente comum não vê os atalhos da equipe", async () => {
    sessao.mockReturnValue({ data: { user: { name: "Bia", email: "bia@x.com", role: "CUSTOMER" } } });
    render(<BarraInferior />);

    await userEvent.click(screen.getByRole("button", { name: "Perfil" }));

    const conta = screen.getByRole("dialog", { name: "Sua conta" });
    expect(within(conta).queryByRole("link", { name: /admin/i })).toBeNull();
    expect(within(conta).queryByRole("link", { name: /cozinha/i })).toBeNull();
    expect(within(conta).getByRole("link", { name: /meus pedidos/i })).toBeDefined();
  });
});
