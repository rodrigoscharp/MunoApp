import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "tenant-1";
const ORDER_ID = "order-1";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const orderUpdateMany = vi.fn();
const orderFindUnique = vi.fn();
const orderFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      updateMany: (...a: unknown[]) => orderUpdateMany(...a),
      findUnique: (...a: unknown[]) => orderFindUnique(...a),
      findFirst: (...a: unknown[]) => orderFindFirst(...a),
    },
  },
}));

vi.mock("@/lib/realtime", () => ({
  broadcastOrderUpdate: vi.fn(),
  broadcastTenantEvent: vi.fn(),
}));

import { GET, PATCH } from "./route";

function req(body: unknown) {
  return new NextRequest(`http://localhost/api/orders/${ORDER_ID}`, {
    method: "PATCH",
    headers: { "x-tenant-id": TENANT, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: ORDER_ID }) };

/** O pedido como está no banco antes do PATCH. */
function pedidoAtual(over: Record<string, unknown> = {}) {
  orderFindUnique.mockResolvedValue({
    status: "PENDING",
    deliveryType: "PICKUP",
    paymentStatus: "UNPAID",
    paymentMethod: "CASH",
    ...over,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { role: "KITCHEN" } });
  pedidoAtual();
  orderUpdateMany.mockResolvedValue({ count: 1 });
  orderFindFirst.mockResolvedValue({ id: ORDER_ID, items: [] });
});

describe("PATCH /api/orders/[id]", () => {
  /**
   * OUT_FOR_DELIVERY existe no enum do banco e é o que a cozinha grava ao
   * mandar um delivery para a rua, mas faltava nesta lista: o botão "Saiu p/
   * entrega" tomava 400 e o pedido não saía do PRONTO. Faltar aqui era a outra
   * metade do mesmo bug que fazia o botão gravar DELIVERED.
   */
  it("aceita OUT_FOR_DELIVERY (delivery pronto saindo para a rua)", async () => {
    pedidoAtual({ status: "READY", deliveryType: "DELIVERY" });

    const res = await PATCH(req({ status: "OUT_FOR_DELIVERY" }), params);

    expect(res.status).toBe(200);
    expect(orderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "OUT_FOR_DELIVERY" } })
    );
  });

  it("recusa status que não existe", async () => {
    const res = await PATCH(req({ status: "ENTREGANDO" }), params);

    expect(res.status).toBe(400);
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it("pedido que não existe neste restaurante é 404, e não 500", async () => {
    orderFindUnique.mockResolvedValue(null);
    expect((await PATCH(req({ status: "READY" }), params)).status).toBe(404);
  });
});

/**
 * A ordem dos passos morava só na tela da cozinha: o servidor aceitava qualquer
 * status, então dava para reabrir um pedido entregue, pular a cozinha, ou
 * cancelar sem querer um pedido já pago online.
 */
describe("PATCH /api/orders/[id]: máquina de estados", () => {
  it.each([
    ["PENDING", "PICKUP", "CONFIRMED"],
    ["CONFIRMED", "PICKUP", "IN_PREPARATION"],
    ["IN_PREPARATION", "PICKUP", "READY"],
    ["READY", "PICKUP", "DELIVERED"],
    ["READY", "DINE_IN", "DELIVERED"],
    ["READY", "DELIVERY", "OUT_FOR_DELIVERY"],
    ["OUT_FOR_DELIVERY", "DELIVERY", "DELIVERED"],
  ])("avança %s (%s) para %s", async (de, entrega, para) => {
    pedidoAtual({ status: de, deliveryType: entrega });
    expect((await PATCH(req({ status: para }), params)).status).toBe(200);
  });

  it.each([
    ["CONFIRMED", "PENDING"],
    ["IN_PREPARATION", "CONFIRMED"],
    ["READY", "IN_PREPARATION"],
    ["OUT_FOR_DELIVERY", "READY"],
  ])("volta um passo: %s para %s", async (de, para) => {
    pedidoAtual({ status: de, deliveryType: "DELIVERY" });
    expect((await PATCH(req({ status: para }), params)).status).toBe(200);
  });

  it.each(["PENDING", "CONFIRMED", "IN_PREPARATION", "READY", "OUT_FOR_DELIVERY"])(
    "cancela a partir de %s",
    async (de) => {
      pedidoAtual({ status: de, deliveryType: "DELIVERY" });
      expect((await PATCH(req({ status: "CANCELLED" }), params)).status).toBe(200);
    }
  );

  it.each([
    ["DELIVERED", "PENDING"],
    ["DELIVERED", "READY"],
    ["CANCELLED", "PENDING"],
    ["CANCELLED", "CONFIRMED"],
  ])("não reabre pedido encerrado: %s para %s", async (de, para) => {
    pedidoAtual({ status: de });
    const res = await PATCH(req({ status: para }), params);
    expect(res.status).toBe(409);
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it.each(["DELIVERED", "CANCELLED"])("não cancela nem entrega o que já terminou (%s)", async (de) => {
    pedidoAtual({ status: de });
    expect((await PATCH(req({ status: "CANCELLED" }), params)).status).toBe(
      de === "CANCELLED" ? 200 : 409
    );
  });

  it("não pula a cozinha: PENDING direto para READY é 409", async () => {
    pedidoAtual({ status: "PENDING" });
    expect((await PATCH(req({ status: "READY" }), params)).status).toBe(409);
  });

  it("retirada não vai para OUT_FOR_DELIVERY", async () => {
    pedidoAtual({ status: "READY", deliveryType: "PICKUP" });
    expect((await PATCH(req({ status: "OUT_FOR_DELIVERY" }), params)).status).toBe(409);
  });

  it("repetir o status atual é idempotente (clique duplo na cozinha)", async () => {
    pedidoAtual({ status: "READY" });
    expect((await PATCH(req({ status: "READY" }), params)).status).toBe(200);
  });

  it("grava só se o pedido ainda está no status que foi lido (duas telas da cozinha)", async () => {
    pedidoAtual({ status: "PENDING" });

    await PATCH(req({ status: "CONFIRMED" }), params);

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, status: "PENDING" },
      data: { status: "CONFIRMED" },
    });
  });

  it("se outra tela mudou o pedido no meio, responde 409 em vez de sobrescrever", async () => {
    pedidoAtual({ status: "PENDING" });
    orderUpdateMany.mockResolvedValue({ count: 0 });

    expect((await PATCH(req({ status: "CONFIRMED" }), params)).status).toBe(409);
  });

  // Cancelar um pedido que o cliente já pagou online não devolve o dinheiro: o
  // estorno é manual no gateway, e este alerta é o que lembra alguém.
  it("cancelar pedido pago online é reportado para estorno", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    pedidoAtual({ status: "IN_PREPARATION", paymentStatus: "PAID", paymentMethod: "PIX" });

    expect((await PATCH(req({ status: "CANCELLED" }), params)).status).toBe(200);

    expect(erro.mock.calls.flat().join(" ")).toContain("orders:cancelado-pago");
    erro.mockRestore();
  });

  it("cancelar pedido de dinheiro na entrega não gera alerta de estorno", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    pedidoAtual({ status: "PENDING", paymentStatus: "UNPAID", paymentMethod: "CASH" });

    await PATCH(req({ status: "CANCELLED" }), params);

    expect(erro.mock.calls.flat().join(" ")).not.toContain("orders:cancelado-pago");
    erro.mockRestore();
  });

  it("mudança de pagamento sem status não passa pela máquina de estados", async () => {
    auth.mockResolvedValue({ user: { role: "ADMIN" } });
    pedidoAtual({ status: "DELIVERED" });

    expect((await PATCH(req({ paymentStatus: "PAID" }), params)).status).toBe(200);
  });
});


describe("PATCH /api/orders/[id]: dinheiro é do ADMIN", () => {
  it.each([{ paymentStatus: "PAID" }, { paymentStatus: "REFUNDED" }, { mpPaymentId: "pay_x" }])(
    "KITCHEN não pode enviar %o",
    async (campo) => {
      auth.mockResolvedValue({ user: { role: "KITCHEN" } });

      const res = await PATCH(req(campo), params);

      expect(res.status).toBe(403);
      expect(orderUpdateMany).not.toHaveBeenCalled();
    }
  );

  it("KITCHEN continua mudando o status do pedido", async () => {
    auth.mockResolvedValue({ user: { role: "KITCHEN" } });
    pedidoAtual({ status: "IN_PREPARATION" });
    expect((await PATCH(req({ status: "READY" }), params)).status).toBe(200);
  });

  it("ADMIN marca como pago", async () => {
    auth.mockResolvedValue({ user: { role: "ADMIN" } });
    expect((await PATCH(req({ paymentStatus: "PAID" }), params)).status).toBe(200);
  });

  it("corpo que não é JSON responde 400, e não 500", async () => {
    const res = await PATCH(
      new NextRequest(`http://localhost/api/orders/${ORDER_ID}`, {
        method: "PATCH",
        headers: { "x-tenant-id": TENANT, "Content-Type": "application/json" },
        body: "{quebrado",
      }),
      params
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/orders/[id]", () => {
  const completo = {
    id: ORDER_ID,
    userId: null,
    customerName: "Ana",
    customerPhone: "11999998888",
    mpPaymentId: "pay_1",
    notes: "sem cebola",
    items: [],
    user: null,
  };
  const get = () =>
    GET(
      new NextRequest(`http://localhost/api/orders/${ORDER_ID}`, {
        headers: { "x-tenant-id": TENANT },
      }),
      params
    );

  beforeEach(() => orderFindUnique.mockResolvedValue(completo));

  it("pedido de mesa anônimo, lido sem login, sai sem telefone nem id do gateway", async () => {
    auth.mockResolvedValue(null);

    const corpo = await (await get()).json();

    expect(corpo.id).toBe(ORDER_ID);
    expect(corpo.customerName).toBe("Ana");
    expect(corpo).not.toHaveProperty("customerPhone");
    expect(corpo).not.toHaveProperty("mpPaymentId");
  });

  it("cliente logado que não é dono de pedido anônimo também não vê o telefone", async () => {
    auth.mockResolvedValue({ user: { id: "outro", role: "CUSTOMER" } });
    const corpo = await (await get()).json();
    expect(corpo).not.toHaveProperty("customerPhone");
  });

  it.each(["ADMIN", "KITCHEN"])("%s vê o pedido completo", async (role) => {
    auth.mockResolvedValue({ user: { id: "u1", role } });
    const corpo = await (await get()).json();
    expect(corpo.customerPhone).toBe("11999998888");
  });

  it("o dono vê o próprio pedido completo", async () => {
    orderFindUnique.mockResolvedValue({ ...completo, userId: "dono-1" });
    auth.mockResolvedValue({ user: { id: "dono-1", role: "CUSTOMER" } });
    const corpo = await (await get()).json();
    expect(corpo.customerPhone).toBe("11999998888");
  });

  it("pedido de outro cliente logado continua 404", async () => {
    orderFindUnique.mockResolvedValue({ ...completo, userId: "dono-1" });
    auth.mockResolvedValue({ user: { id: "intruso", role: "CUSTOMER" } });
    expect((await get()).status).toBe(404);
  });
});
