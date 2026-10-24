import { describe, expect, it } from "vitest";
import { aplicarAtualizacao, intervaloDaCozinha } from "./cozinha-eventos";
import type { OrderStatus, OrderWithItems } from "@/types";

const noQuadro = (s: OrderStatus) => s !== "DELIVERED" && s !== "CANCELLED";

function pedido(over: Partial<OrderWithItems> = {}): OrderWithItems {
  return {
    id: "o1",
    status: "PENDING",
    paymentMethod: "PIX",
    paymentStatus: "UNPAID",
    deliveryType: "DELIVERY",
    total: 10,
    notes: null,
    customerName: null,
    customerPhone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [],
    ...over,
  } as OrderWithItems;
}

describe("aplicarAtualizacao", () => {
  it("remenda status e pagamento do pedido que está na tela, sem buscar", () => {
    const r = aplicarAtualizacao(
      [pedido()],
      { id: "o1", status: "CONFIRMED", paymentStatus: "PAID", paymentMethod: "PIX" },
      noQuadro
    );
    expect(r.buscar).toBe(false);
    expect(r.pedidos[0]).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID" });
  });

  it("aceita o id no formato antigo (orderId)", () => {
    const r = aplicarAtualizacao([pedido()], { orderId: "o1", status: "READY" }, noQuadro);
    expect(r.pedidos[0].status).toBe("READY");
  });

  it("campo ausente ou desconhecido não apaga o que a tela sabe", () => {
    const r = aplicarAtualizacao(
      [pedido({ paymentStatus: "PAID" })],
      { id: "o1", paymentStatus: "QUALQUER", status: undefined },
      noQuadro
    );
    expect(r.pedidos[0]).toMatchObject({ status: "PENDING", paymentStatus: "PAID" });
  });

  it("pedido que terminou sai da tela", () => {
    const r = aplicarAtualizacao([pedido()], { id: "o1", status: "CANCELLED" }, noQuadro);
    expect(r.pedidos).toEqual([]);
    expect(r.buscar).toBe(false);
  });

  it("pedido desconhecido que pertence ao quadro pede busca", () => {
    expect(aplicarAtualizacao([], { id: "o9", status: "READY" }, noQuadro).buscar).toBe(true);
    expect(aplicarAtualizacao([], { id: "o9" }, noQuadro).buscar).toBe(true);
  });

  it("pedido desconhecido que já terminou não pede busca", () => {
    expect(aplicarAtualizacao([], { id: "o9", status: "DELIVERED" }, noQuadro).buscar).toBe(false);
  });

  it("payload sem id pede busca", () => {
    expect(aplicarAtualizacao([pedido()], { status: "READY" }, noQuadro).buscar).toBe(true);
  });
});

describe("intervaloDaCozinha", () => {
  it("60s com tempo real, 10s sem", () => {
    expect(intervaloDaCozinha(true)).toBe(60_000);
    expect(intervaloDaCozinha(false)).toBe(10_000);
  });
});
