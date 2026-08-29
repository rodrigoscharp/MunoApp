// @vitest-environment jsdom
/**
 * O histórico de pedidos do /adm.
 *
 * É a tela para onde o dono vai quando um cliente liga reclamando, então ela
 * precisa de duas coisas: achar o pedido (o filtro) e contar a verdade sobre o
 * que foi cobrado (o modal). O subtotal do modal é recomposto do total, como no
 * acompanhamento do cliente — as duas telas precisam dar o mesmo número, senão
 * o dono e o cliente discutem olhando contas diferentes.
 */

import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminOrdersTable } from "./AdminOrdersTable";

function pedido(over: Record<string, unknown> = {}) {
  return {
    id: "pedido-abc123",
    status: "PENDING",
    paymentMethod: "PIX",
    paymentStatus: "UNPAID",
    deliveryType: "DELIVERY",
    total: 50,
    notes: null,
    customerName: null,
    customerPhone: null,
    createdAt: "2026-08-29T12:00:00.000Z",
    updatedAt: "2026-08-29T12:00:00.000Z",
    items: [
      {
        id: "oi-1",
        quantity: 2,
        unitPrice: 25,
        notes: null,
        menuItem: { id: "item-1", name: "X-Salada", imageUrl: null },
      },
    ],
    user: { name: "Ana", email: "ana@exemplo.com" },
    table: null,
    ...over,
  };
}

const montar = (pedidos: Record<string, unknown>[] = [pedido()]) =>
  render(<AdminOrdersTable orders={pedidos as never} />);

/**
 * Abre o modal clicando na linha e devolve o card dele — escopo necessário
 * porque valores como o total aparecem também na linha da tabela atrás.
 */
async function abrirDetalhe(idCurto = "#ABC123") {
  await userEvent.click(screen.getByText(idCurto));
  return document.querySelector<HTMLElement>(".max-w-md")!;
}

afterEach(() => {
  cleanup();
});

describe("a lista", () => {
  it("mostra o id curto, o cliente e o total", () => {
    montar();

    expect(screen.getByText("#ABC123")).toBeDefined();
    expect(screen.getByText("Ana")).toBeDefined();
    expect(screen.getByText("R$ 50,00")).toBeDefined();
  });

  it("avisa quando não há pedido nenhum", () => {
    montar([]);
    expect(screen.getByText(/nenhum pedido encontrado/i)).toBeDefined();
  });

  it("mostra travessão quando o pedido não tem cliente identificado", () => {
    montar([pedido({ user: null, customerName: null })]);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("mostra a mesa quando o pedido é do salão", () => {
    montar([pedido({ table: { number: 7, name: null } })]);
    expect(screen.getByText("Mesa 7")).toBeDefined();
  });

  it("prefere o nome da mesa ao número", () => {
    montar([pedido({ table: { number: 7, name: "Varanda" } })]);
    expect(screen.getByText("Varanda")).toBeDefined();
  });

  it("na mesa, o nome digitado vence o da conta", () => {
    // Quem está sentado pode não ser o dono do login.
    montar([
      pedido({ deliveryType: "DINE_IN", customerName: "João", user: { name: "Ana", email: "a@x" } }),
    ]);
    expect(screen.getByText("João")).toBeDefined();
  });

  it("no delivery, o nome da conta vence o digitado", () => {
    montar([
      pedido({ deliveryType: "DELIVERY", customerName: "João", user: { name: "Ana", email: "a@x" } }),
    ]);
    expect(screen.getByText("Ana")).toBeDefined();
  });
});

describe("o filtro por status", () => {
  const umDeCada = [
    pedido({ id: "p-pendente1", status: "PENDING" }),
    pedido({ id: "p-emrota1", status: "OUT_FOR_DELIVERY" }),
    pedido({ id: "p-entreg1", status: "DELIVERED" }),
  ];

  it("começa mostrando todos", () => {
    montar(umDeCada);
    expect(screen.getAllByText(/^#/)).toHaveLength(3);
  });

  it("filtra pelo status escolhido", async () => {
    montar(umDeCada);
    await userEvent.click(screen.getByRole("button", { name: "Entregue" }));

    expect(screen.getAllByText(/^#/)).toHaveLength(1);
    expect(screen.getByText("#NTREG1")).toBeDefined();
  });

  it("volta a mostrar todos ao escolher Todos", async () => {
    montar(umDeCada);
    await userEvent.click(screen.getByRole("button", { name: "Entregue" }));
    await userEvent.click(screen.getByRole("button", { name: "Todos" }));

    expect(screen.getAllByText(/^#/)).toHaveLength(3);
  });

  it("diz que não encontrou nada quando o filtro esvazia a lista", async () => {
    montar([pedido({ status: "PENDING" })]);
    await userEvent.click(screen.getByRole("button", { name: "Cancelado" }));

    expect(screen.getByText(/nenhum pedido encontrado/i)).toBeDefined();
  });

  it("oferece filtro para todo status que a tabela sabe exibir", () => {
    // "Em Entrega" aparece na coluna de status mas não tinha botão de filtro:
    // o pedido em rua ficava inalcançável justamente na hora em que o cliente
    // liga perguntando dele.
    montar(umDeCada);

    for (const rotulo of [
      "Pendente",
      "Confirmado",
      "Em Preparo",
      "Pronto",
      "Em Entrega",
      "Entregue",
      "Cancelado",
    ]) {
      expect(screen.getByRole("button", { name: rotulo }), rotulo).toBeDefined();
    }
  });

  it("o filtro de Em Entrega encontra o pedido em rua", async () => {
    montar(umDeCada);
    await userEvent.click(screen.getByRole("button", { name: "Em Entrega" }));

    expect(screen.getAllByText(/^#/)).toHaveLength(1);
    // "p-emrota1" → últimos seis, em maiúsculas.
    expect(screen.getByText("#MROTA1")).toBeDefined();
  });
});

describe("o detalhe do pedido", () => {
  it("abre ao clicar na linha", async () => {
    montar();
    await abrirDetalhe();

    expect(screen.getByRole("heading", { name: "Pedido #ABC123" })).toBeDefined();
  });

  it("fecha no X", async () => {
    montar();
    const modal = await abrirDetalhe();
    await userEvent.click(within(modal).getAllByRole("button")[0]);

    expect(screen.queryByRole("heading", { name: /pedido #/i })).toBeNull();
  });

  it("lista os itens com quantidade e subtotal", async () => {
    montar();
    const modal = await abrirDetalhe();

    expect(within(modal).getByText("2x")).toBeDefined();
    expect(within(modal).getByText("X-Salada")).toBeDefined();
  });

  it("mostra a observação do pedido em destaque", async () => {
    montar([pedido({ notes: "tocar a campainha" })]);
    const modal = await abrirDetalhe();

    expect(within(modal).getByText("tocar a campainha")).toBeDefined();
  });

  it("mostra o contato do cliente", async () => {
    montar([pedido({ customerPhone: "11999998888" })]);
    const modal = await abrirDetalhe();

    expect(within(modal).getByText("ana@exemplo.com")).toBeDefined();
    expect(within(modal).getByText("11999998888")).toBeDefined();
  });
});

describe("a conta no detalhe", () => {
  it("esconde o bloco num pedido sem frete nem desconto", async () => {
    montar([pedido({ total: 50, deliveryFee: 0, discount: 0 })]);
    const modal = await abrirDetalhe();

    expect(within(modal).queryByText("Subtotal")).toBeNull();
    expect(within(modal).getByText("Total")).toBeDefined();
  });

  it("recompõe o subtotal com frete e desconto", async () => {
    // itens 50 + frete 8 − desconto 10 = total 48.
    montar([pedido({ total: 48, deliveryFee: 8, discount: 10, couponCode: "PROMO10" })]);
    const modal = await abrirDetalhe();

    expect(within(modal).getByText("Subtotal")).toBeDefined();
    expect(within(modal).getAllByText("R$ 50,00").length).toBeGreaterThan(0);
    expect(within(modal).getByText("R$ 8,00")).toBeDefined();
    expect(within(modal).getByText("-R$ 10,00")).toBeDefined();
    expect(within(modal).getByText("R$ 48,00")).toBeDefined();
    expect(within(modal).getByText(/PROMO10/)).toBeDefined();
  });

  it("dá o mesmo subtotal que a tela do cliente daria", async () => {
    // A fórmula é a mesma nos dois lados: total − frete + desconto.
    montar([pedido({ total: 58, deliveryFee: 8, discount: 0 })]);
    const modal = await abrirDetalhe();

    expect(within(modal).getAllByText("R$ 50,00").length).toBeGreaterThan(0);
  });
});
