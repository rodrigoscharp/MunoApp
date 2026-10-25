import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "tenant-1";
const COUPON_ID = "coupon-1";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const couponDelete = vi.fn();
const couponUpdate = vi.fn();
const couponUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    coupon: {
      delete: (...a: unknown[]) => couponDelete(...a),
      update: (...a: unknown[]) => couponUpdate(...a),
      updateMany: (...a: unknown[]) => couponUpdateMany(...a),
    },
  },
}));

import { DELETE, PATCH } from "./route";

function req() {
  return new NextRequest(`http://localhost/api/coupons/${COUPON_ID}`, {
    method: "DELETE",
    headers: { "x-tenant-id": TENANT },
  });
}

const params = { params: Promise.resolve({ id: COUPON_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { role: "ADMIN" } });
  couponDelete.mockResolvedValue({ id: COUPON_ID });
});

describe("DELETE /api/coupons/[id]", () => {
  it("apaga o cupom", async () => {
    const res = await DELETE(req(), params);

    expect(res.status).toBe(200);
    expect(couponDelete).toHaveBeenCalledWith({ where: { id: COUPON_ID } });
  });

  // O PATCH ao lado já tratava P2025; o DELETE não, e o admin via "Erro interno
  // do servidor" ao apagar um cupom que outra aba já tinha apagado.
  it("devolve 404 quando o cupom não existe", async () => {
    couponDelete.mockRejectedValue(Object.assign(new Error("P2025"), { code: "P2025" }));

    const res = await DELETE(req(), params);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/coupons/[id] — destaque", () => {
  const cupom = { code: "promo10", type: "FIXED", value: 10, minOrder: 0, active: true, destaque: true };
  function patch() {
    return new NextRequest(`http://localhost/api/coupons/${COUPON_ID}`, {
      method: "PATCH",
      headers: { "x-tenant-id": TENANT, "Content-Type": "application/json" },
      body: JSON.stringify(cupom),
    });
  }

  it("desmarca os outros depois de gravar este", async () => {
    couponUpdate.mockResolvedValue({ id: COUPON_ID, _count: { orders: 0 } });
    const res = await PATCH(patch(), params);
    expect(res.status).toBe(200);
    expect(couponUpdateMany).toHaveBeenCalledWith({
      where: { destaque: true, id: { not: COUPON_ID } },
      data: { destaque: false },
    });
    expect(couponUpdate.mock.invocationCallOrder[0]).toBeLessThan(couponUpdateMany.mock.invocationCallOrder[0]);
  });

  // Antes, o destaque que estava no ar era desmarcado e a gravação falhava:
  // a loja ficava sem card de cupom nenhum.
  it.each([
    ["P2002", 409],
    ["P2025", 404],
  ])("gravação recusada (%s) não mexe no destaque atual", async (codigo, status) => {
    couponUpdate.mockRejectedValue({ code: codigo });
    const res = await PATCH(patch(), params);
    expect(res.status).toBe(status);
    expect(couponUpdateMany).not.toHaveBeenCalled();
  });
});
