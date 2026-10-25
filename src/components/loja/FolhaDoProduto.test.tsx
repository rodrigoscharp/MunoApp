// @vitest-environment jsdom
/**
 * O selo da folha do produto. A fileira de "Mais pedidos" é completada com
 * itens que não venderam; o selo só pode ir para os que venderam, senão um
 * restaurante sem venda nenhuma anuncia "O mais pedido" no primeiro item com
 * foto.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/menu/CartFlyAnimation", () => ({ triggerCartFly: vi.fn() }));

import { ProvedorDaFolha, seloDeMaisPedido, useFolhaDoProduto } from "./FolhaDoProduto";
import type { ItemDaVitrine } from "./tipos";

const item = (id: string): ItemDaVitrine => ({
  id,
  name: `Item ${id}`,
  description: null,
  price: 10,
  imageUrl: null,
  available: true,
});
const FILEIRA = [item("a"), item("b"), item("c")];

afterEach(cleanup);

describe("seloDeMaisPedido", () => {
  it("só os vendidos ganham selo", () => {
    expect(seloDeMaisPedido("a", FILEIRA, 2)).toBe("O mais pedido");
    expect(seloDeMaisPedido("b", FILEIRA, 2)).toBe("Mais pedido");
    expect(seloDeMaisPedido("c", FILEIRA, 2)).toBeUndefined();
    expect(seloDeMaisPedido("x", FILEIRA, 2)).toBeUndefined();
  });

  it("sem venda nenhuma, ninguém é o mais pedido", () => {
    expect(seloDeMaisPedido("a", FILEIRA, 0)).toBeUndefined();
  });
});

function Abrir({ alvo }: { alvo: ItemDaVitrine }) {
  const folha = useFolhaDoProduto();
  return (
    <button type="button" onClick={(e) => folha?.abrir(alvo, e.currentTarget)}>
      abrir {alvo.id}
    </button>
  );
}

describe("ProvedorDaFolha", () => {
  it("item de enchimento abre sem selo, mas ainda mostra 'Combina com'", async () => {
    render(
      <ProvedorDaFolha restaurantOpen maisPedidos={FILEIRA} vendidos={0}>
        <Abrir alvo={FILEIRA[0]} />
      </ProvedorDaFolha>
    );
    await userEvent.click(screen.getByRole("button", { name: "abrir a" }));
    expect(screen.queryByText("O mais pedido")).toBeNull();
    expect(screen.getByText("Combina com")).toBeDefined();
  });

  it("item vendido abre com selo", async () => {
    render(
      <ProvedorDaFolha restaurantOpen maisPedidos={FILEIRA} vendidos={1}>
        <Abrir alvo={FILEIRA[0]} />
      </ProvedorDaFolha>
    );
    await userEvent.click(screen.getByRole("button", { name: "abrir a" }));
    expect(screen.getByText("O mais pedido")).toBeDefined();
  });
});
