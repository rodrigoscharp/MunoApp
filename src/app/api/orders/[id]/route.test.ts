import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "tenant-1";
const ORDER_ID = "order-1";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const orderUpdate = vi.fn();
const orderFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      update: (...a: unknown[]) => orderUpdate(...a),
      findUnique: (...a: unknown[]) => orderFindUnique(...a),
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

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { role: "KITCHEN" } });
  orderUpdate.mockResolvedValue({ id: ORDER_ID, items: [] });
});

describe("PATCH /api/orders/[id]", () => {
  /**
   * OUT_FOR_DELIVERY existe no enum do banco e é o que a cozinha grava ao
   * mandar um delivery para a rua, mas faltava nesta lista: o botão "Saiu p/
   * entrega" tomava 400 e o pedido não saía do PRONTO. Faltar aqui era a outra
   * metade do mesmo bug que fazia o botão gravar DELIVERED.
   */
  it("aceita OUT_FOR_DELIVERY", async () => {
    const res = await PATCH(req({ status: "OUT_FOR_DELIVERY" }), params);

    expect(res.status).toBe(200);
    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "OUT_FOR_DELIVERY" } })
    );
  });

  it("aceita os demais status do quadro", async () => {
    for (const status of ["PENDING", "CONFIRMED", "IN_PREPARATION", "READY", "DELIVERED", "CANCELLED"]) {
      orderUpdate.mockClear();
      const res = await PATCH(req({ status }), params);
      expect(res.status, `status ${status}`).toBe(200);
    }
  });

  it("recusa status que não existe", async () => {
    const res = await PATCH(req({ status: "ENTREGANDO" }), params);

    expect(res.status).toBe(400);
    expect(orderUpdate).not.toHaveBeenCalled();
  });
});


describe("PATCH /api/orders/[id]: dinheiro é do ADMIN", () => {
  it.each([{ paymentStatus: "PAID" }, { paymentStatus: "REFUNDED" }, { mpPaymentId: "pay_x" }])(
    "KITCHEN não pode enviar %o",
    async (campo) => {
      auth.mockResolvedValue({ user: { role: "KITCHEN" } });

      const res = await PATCH(req(campo), params);

      expect(res.status).toBe(403);
      expect(orderUpdate).not.toHaveBeenCalled();
    }
  );

  it("KITCHEN continua mudando o status do pedido", async () => {
    auth.mockResolvedValue({ user: { role: "KITCHEN" } });
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
