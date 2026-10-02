// @vitest-environment jsdom
/**
 * O filtro de restrições do cardápio.
 *
 * O que este arquivo protege é o contrário do que a IA fazia: o cardápio só
 * afirma "sem lactose" sobre o que o restaurante DECLAROU. Item sem declaração
 * não aparece em filtro nenhum, e o card inteiro some quando não há nada
 * declarado, para o restaurante que ainda não preencheu não mostrar um filtro
 * que devolve sempre zero.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/menu/CartFlyAnimation", () => ({ triggerCartFly: vi.fn() }));

import { FiltroDeRestricoes } from "./FiltroDeRestricoes";
import { useCart } from "@/hooks/useCart";
import type { MenuItemWithCategory } from "@/types";

const CATEGORIA = { id: "cat-1", name: "Lanches", slug: "lanches" };

function prato(
  id: string,
  name: string,
  declaracao: Partial<MenuItemWithCategory> = {}
): MenuItemWithCategory {
  return {
    id,
    name,
    description: null,
    price: 20,
    imageUrl: null,
    available: true,
    categoryId: CATEGORIA.id,
    category: CATEGORIA,
    ...declaracao,
  };
}

const SALADA = prato("1", "Salada", { containsGluten: false, containsLactose: false, isVegan: true });
const BURGER = prato("2", "X-Burguer", { containsGluten: true, containsLactose: true, isVegan: false });
const PAO_DE_QUEIJO = prato("3", "Pão de queijo", { containsGluten: false, containsLactose: true });
const SEM_INFO = prato("4", "Prato novo");
const BURGER_VEGETAL = prato("5", "Hambúrguer vegetal", { isVegan: true, containsGluten: true });

const CARDAPIO = [SALADA, BURGER, PAO_DE_QUEIJO, SEM_INFO];

const montar = (itens = CARDAPIO, restaurantOpen = true) =>
  render(<FiltroDeRestricoes menuItems={itens} restaurantOpen={restaurantOpen} />);

const botao = (nome: string) => screen.getByRole("button", { name: nome });
const clicar = (nome: string) => userEvent.click(botao(nome));
const AVISO = /informado pelo restaurante/i;

beforeEach(() => {
  localStorage.clear();
  useCart.setState({ items: [] });
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("quando o card aparece", () => {
  it("não renderiza nada se nenhum item declarou algo filtrável", () => {
    // BURGER só declara que CONTÉM, e isso não habilita botão nenhum.
    const { container } = montar([BURGER, SEM_INFO]);

    expect(container.firstChild).toBeNull();
  });

  it("só mostra o botão que algum item atende", () => {
    montar([PAO_DE_QUEIJO, SEM_INFO]);

    expect(botao("Sem glúten")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Vegano" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sem lactose" })).toBeNull();
  });

  it("não tem campo de texto nem chama a rede: é só filtro", async () => {
    montar();
    await clicar("Sem lactose");

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("filtrar", () => {
  it("não lista item nenhum antes de clicar", () => {
    montar();

    expect(screen.queryByText("Salada")).toBeNull();
    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it("'Sem lactose' mostra só quem declarou, e nunca item sem informação", async () => {
    montar();
    await clicar("Sem lactose");

    expect(screen.getByText("Salada")).toBeDefined();
    expect(screen.queryByText("Pão de queijo")).toBeNull(); // contém lactose
    expect(screen.queryByText("X-Burguer")).toBeNull();
    expect(screen.queryByText("Prato novo")).toBeNull(); // não informado
  });

  it("'Sem glúten' mostra quem declarou sem glúten", async () => {
    montar();
    await clicar("Sem glúten");

    expect(screen.getByText("Salada")).toBeDefined();
    expect(screen.getByText("Pão de queijo")).toBeDefined();
    expect(screen.queryByText("X-Burguer")).toBeNull();
  });

  it("combina os filtros por E", async () => {
    montar();
    await clicar("Sem glúten");
    await clicar("Sem lactose");

    expect(screen.getByText("Salada")).toBeDefined();
    expect(screen.queryByText("Pão de queijo")).toBeNull();
  });

  it("clicar de novo desliga o filtro", async () => {
    montar();
    await clicar("Sem lactose");
    await clicar("Sem lactose");

    expect(screen.queryByText("Salada")).toBeNull();
    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it("marca o botão ativo para leitor de tela", async () => {
    montar();
    expect(botao("Vegano").getAttribute("aria-pressed")).toBe("false");

    await clicar("Vegano");
    expect(botao("Vegano").getAttribute("aria-pressed")).toBe("true");
  });

  it("mostra o aviso de que a informação vem do restaurante", async () => {
    montar();
    await clicar("Vegano");

    expect(
      screen.getByText(
        "Informado pelo restaurante. Em caso de alergia, confirme com a equipe antes de pedir."
      )
    ).toBeDefined();
  });

  it("combinação sem resultado avisa, e 'Limpar filtros' desfaz", async () => {
    // O hambúrguer vegetal é vegano mas contém glúten; o pão de queijo é sem
    // glúten mas não é vegano. Os dois botões existem, a combinação é vazia.
    montar([PAO_DE_QUEIJO, BURGER_VEGETAL]);
    await clicar("Vegano");
    await clicar("Sem glúten");

    expect(screen.getByText("Nenhum item atende a todos os filtros marcados.")).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));

    expect(screen.queryByText(/nenhum item atende/i)).toBeNull();
    expect(botao("Vegano").getAttribute("aria-pressed")).toBe("false");
    expect(botao("Sem glúten").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("pedir pelo card", () => {
  it("'+ Adicionar' põe o item no carrinho", async () => {
    montar();
    await clicar("Sem lactose");
    await userEvent.click(screen.getByRole("button", { name: /adicionar/i }));

    expect(useCart.getState().items.map((i) => i.id)).toEqual(["1"]);
  });

  it("com o restaurante fechado, o botão de adicionar fica desabilitado", async () => {
    montar(CARDAPIO, false);
    await clicar("Sem lactose");

    const adicionar = screen.getByRole("button", { name: /adicionar/i }) as HTMLButtonElement;
    expect(adicionar.disabled).toBe(true);
  });
});

describe("o cardápio muda por baixo (cache de 60s)", () => {
  // O pior erro possível aqui é ALARGAR a lista em silêncio: quem pediu "sem
  // lactose" não pode passar a ver item sem essa declaração só porque o dono
  // editou o cardápio com o card aberto. O filtro ligado continua visível e
  // continua valendo; sem item que o atenda, a lista fica vazia e o cliente vê
  // por quê.
  it("filtro ligado cujo item perdeu a declaração continua valendo, visível e sem resultado", async () => {
    const { rerender } = montar();
    await clicar("Sem lactose");
    expect(screen.getByText("Salada")).toBeDefined();

    // O dono tirou a declaração de lactose; sobrou só um item vegano.
    const vegano = prato("6", "Salada vegana", { isVegan: true, containsLactose: true });
    rerender(<FiltroDeRestricoes menuItems={[vegano]} restaurantOpen />);

    expect(botao("Sem lactose").getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Salada vegana")).toBeNull();
    expect(screen.queryByText("Salada")).toBeNull();
    expect(screen.getByText("Nenhum item atende a todos os filtros marcados.")).toBeDefined();
    expect(screen.getByText(AVISO)).toBeDefined();
  });

  it("numa combinação, perder um filtro não alarga a lista para o outro", async () => {
    const bowl = prato("7", "Bowl vegano", { isVegan: true, containsLactose: false });
    const wrap = prato("8", "Wrap vegano", { isVegan: true, containsLactose: null });
    const { rerender } = montar([bowl, wrap]);
    await clicar("Vegano");
    await clicar("Sem lactose");
    expect(screen.getByText("Bowl vegano")).toBeDefined();

    // O dono tirou a declaração de lactose do bowl: ninguém atende "sem lactose".
    rerender(
      <FiltroDeRestricoes menuItems={[{ ...bowl, containsLactose: null }, wrap]} restaurantOpen />
    );

    expect(screen.queryByText("Wrap vegano")).toBeNull();
    expect(screen.queryByText("Bowl vegano")).toBeNull();
    expect(botao("Sem lactose").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("dispensar o card", () => {
  it("fechar esconde o card, grava a chave e deixa o atalho para reabrir", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Fechar filtro" }));

    expect(screen.queryByRole("button", { name: "Vegano" })).toBeNull();
    expect(localStorage.getItem("muno-filtro-dispensado")).toBe("1");
    expect(screen.getByRole("button", { name: /filtrar por restrição/i })).toBeDefined();
  });

  it("o atalho reabre o card e apaga a chave", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Fechar filtro" }));
    await userEvent.click(screen.getByRole("button", { name: /filtrar por restrição/i }));

    expect(botao("Vegano")).toBeDefined();
    expect(localStorage.getItem("muno-filtro-dispensado")).toBeNull();
  });

  it("abre já fechado se foi dispensado antes", () => {
    localStorage.setItem("muno-filtro-dispensado", "1");
    montar();

    expect(screen.queryByRole("button", { name: "Vegano" })).toBeNull();
    expect(screen.getByRole("button", { name: /filtrar por restrição/i })).toBeDefined();
  });

  it("não quebra se o localStorage estiver bloqueado", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });

    montar();
    expect(botao("Vegano")).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "Fechar filtro" }));
    expect(screen.queryByRole("button", { name: "Vegano" })).toBeNull();
  });
});
