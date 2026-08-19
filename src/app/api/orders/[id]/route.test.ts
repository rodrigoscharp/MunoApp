import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "tenant-1";
const ORDER_ID = "order-1";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const orderUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { order: { update: (...a: unknown[]) => orderUpdate(...a) } },
}));

vi.mock("@/lib/realtime", () => ({
  broadcastOrderUpdate: vi.fn(),
  broadcastTenantEvent: vi.fn(),
}));

import { PATCH } from "./route";

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
