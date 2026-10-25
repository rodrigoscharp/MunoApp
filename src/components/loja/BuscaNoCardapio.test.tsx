// @vitest-environment jsdom
/**
 * A busca do cardápio. Ela filtra o que a página já tem, sem rede, e precisa
 * achar o prato do jeito que as pessoas digitam no celular: sem acento, em
 * minúscula, com as palavras fora de ordem.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/menu/CartFlyAnimation", () => ({ triggerCartFly: vi.fn() }));

import { BuscaNoCardapio, buscarNoCardapio } from "./BuscaNoCardapio";
import type { ItemDaVitrine } from "./tipos";

function item(id: string, name: string, description: string | null = null): ItemDaVitrine {
  return { id, name, description, price: 20, imageUrl: null, available: true };
}

const PAO = item("1", "Pão de queijo", "Mineiro, assado na hora");
const SMASH = item("2", "Smash duplo", "Dois blends, cheddar e cebola caramelizada");
const SUCO = item("3", "Suco de limão");
const CARDAPIO = [PAO, SMASH, SUCO];

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("buscarNoCardapio", () => {
  it("ignora acento e caixa", () => {
    expect(buscarNoCardapio(CARDAPIO, "PAO")).toEqual([PAO]);
    expect(buscarNoCardapio(CARDAPIO, "limao")).toEqual([SUCO]);
  });

  it("procura também na descrição", () => {
    expect(buscarNoCardapio(CARDAPIO, "cheddar")).toEqual([SMASH]);
  });

  it("exige todas as palavras, em qualquer ordem", () => {
    expect(buscarNoCardapio(CARDAPIO, "queijo pão")).toEqual([PAO]);
    expect(buscarNoCardapio(CARDAPIO, "queijo cheddar")).toEqual([]);
  });

  it("termo vazio ou só espaço não devolve nada", () => {
    expect(buscarNoCardapio(CARDAPIO, "")).toEqual([]);
    expect(buscarNoCardapio(CARDAPIO, "   ")).toEqual([]);
  });

  it("item sem descrição não quebra a busca", () => {
    expect(buscarNoCardapio([SUCO], "suco")).toEqual([SUCO]);
  });
});

describe("BuscaNoCardapio", () => {
  const campo = () => screen.getByRole("searchbox", { name: "Buscar no cardápio" });

  it("mostra os resultados com o card do cardápio, sem ir à rede", async () => {
    render(<BuscaNoCardapio itens={CARDAPIO} restaurantOpen />);

    await userEvent.type(campo(), "pao");

    expect(screen.getByRole("heading", { name: "Pão de queijo" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Smash duplo" })).toBeNull();
    expect(screen.getByRole("button", { name: "Adicionar Pão de queijo" })).toBeDefined();
    expect(screen.getByText("1 resultado")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("diz quando nada casa", async () => {
    render(<BuscaNoCardapio itens={CARDAPIO} restaurantOpen />);

    await userEvent.type(campo(), "pizza");

    expect(screen.getByText("Nada encontrado para “pizza”.")).toBeDefined();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("limpar a busca tira os resultados", async () => {
    render(<BuscaNoCardapio itens={CARDAPIO} restaurantOpen />);

    await userEvent.type(campo(), "smash");
    await userEvent.click(screen.getByRole("button", { name: "Limpar busca" }));

    expect((campo() as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("com o restaurante fechado, o resultado aparece mas não entra na sacola", async () => {
    render(<BuscaNoCardapio itens={CARDAPIO} restaurantOpen={false} />);

    await userEvent.type(campo(), "smash");

    const adicionar = screen.getByRole("button", { name: "Adicionar Smash duplo" }) as HTMLButtonElement;
    expect(adicionar.disabled).toBe(true);
  });
});
