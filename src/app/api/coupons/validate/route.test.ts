/**
 * A prévia do cupom no checkout.
 *
 * O valor que sai daqui é só visual — quem grava é POST /api/orders, que refaz
 * tudo do zero. Mas os dois passam pelo mesmo `aplicarCupom`, e é isso que
 * impede o cliente de ver um desconto que não vai ser cobrado. Estes testes
 * prendem esse contrato: preço do banco, frete da zona, código normalizado.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "restaurante-a";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const menuItemFindMany = vi.fn();
const deliveryZoneFindUnique = vi.fn();
const couponFindUnique = vi.fn();
const orderCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    menuItem: { findMany: (...a: unknown[]) => menuItemFindMany(...a) },
    deliveryZone: { findUnique: (...a: unknown[]) => deliveryZoneFindUnique(...a) },
    coupon: { findUnique: (...a: unknown[]) => couponFindUnique(...a) },
    order: { count: (...a: unknown[]) => orderCount(...a) },
  },
}));

import { POST } from "./route";

type Corpo = Record<string, unknown>;

function req(body: Corpo, comTenant = true) {
  return new NextRequest("http://localhost/api/coupons/validate", {
    method: "POST",
    headers: {
      ...(comTenant ? { "x-tenant-id": TENANT } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const corpoBase: Corpo = {
  code: "PROMO10",
  items: [{ menuItemId: "item-1", quantity: 2 }],
  deliveryType: "PICKUP",
};

const cupomFixo = {
  id: "cupom-1",
  code: "PROMO10",
  active: true,
  type: "FIXED",
  value: 5,
  minOrder: 0,
  validFrom: null,
  validUntil: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "cliente-1", role: "CUSTOMER" } });
  menuItemFindMany.mockResolvedValue([{ id: "item-1", price: 10 }]);
  deliveryZoneFindUnique.mockResolvedValue(null);
  couponFindUnique.mockResolvedValue(cupomFixo);
  orderCount.mockResolvedValue(0);
});

describe("porta de entrada", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await POST(req(corpoBase, false));
    expect(res.status).toBe(400);
  });

  it("exige login", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(req(corpoBase));
    expect(res.status).toBe(401);
    expect(couponFindUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["sem código", { items: corpoBase.items }],
    ["código vazio", { code: "   ", items: corpoBase.items }],
    ["sem itens", { code: "PROMO10", items: [] }],
    ["quantidade inválida", { code: "PROMO10", items: [{ menuItemId: "i", quantity: 0 }] }],
  ])("recusa corpo %s", async (_nome, corpo) => {
    const res = await POST(req(corpo as Corpo));
    expect(res.status).toBe(400);
  });
});

describe("o cálculo usa o banco, não o carrinho", () => {
  it("aplica o desconto sobre o subtotal calculado com o preço do banco", async () => {
    const res = await POST(req({ ...corpoBase, items: [{ menuItemId: "item-1", quantity: 2, price: 999 }] }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ code: "PROMO10", discount: 5 });
  });

  it("normaliza o código antes de procurar, como /api/orders", async () => {
    await POST(req({ ...corpoBase, code: "  promo10 " }));
    expect(couponFindUnique).toHaveBeenCalledWith({
      where: { tenantId_code: { tenantId: TENANT, code: "PROMO10" } },
    });
  });

  it("conta os usos do próprio cliente, ignorando pedidos cancelados", async () => {
    await POST(req(corpoBase));
    expect(orderCount).toHaveBeenCalledWith({
      where: { userId: "cliente-1", couponId: "cupom-1", status: { not: "CANCELLED" } },
    });
  });

  it("recusa cupom que o cliente já usou", async () => {
    orderCount.mockResolvedValue(1);
    const res = await POST(req(corpoBase));

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Você já usou este cupom." });
  });
});

describe("cupom recusado devolve 422 com o motivo", () => {
  it("cupom inexistente", async () => {
    couponFindUnique.mockResolvedValue(null);
    const res = await POST(req(corpoBase));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Cupom não encontrado." });
  });

  it("cupom desativado", async () => {
    couponFindUnique.mockResolvedValue({ ...cupomFixo, active: false });
    const res = await POST(req(corpoBase));
    expect(res.status).toBe(422);
  });

  it("cupom expirado", async () => {
    couponFindUnique.mockResolvedValue({
      ...cupomFixo,
      validUntil: new Date("2020-01-01"),
    });
    const res = await POST(req(corpoBase));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Cupom expirado." });
  });

  it("pedido abaixo do mínimo, com o mínimo do banco na mensagem", async () => {
    couponFindUnique.mockResolvedValue({ ...cupomFixo, minOrder: 100 });
    const res = await POST(req(corpoBase));

    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("100");
  });

  it("cupom não vale em pedido de mesa", async () => {
    const res = await POST(req({ ...corpoBase, deliveryType: "DINE_IN" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Cupom não é válido em pedidos de mesa." });
  });
});

describe("frete grátis", () => {
  const cupomFrete = { ...cupomFixo, type: "FREE_SHIPPING", value: 0 };

  it("zera o frete da zona e marca freeShipping", async () => {
    couponFindUnique.mockResolvedValue(cupomFrete);
    deliveryZoneFindUnique.mockResolvedValue({ id: "zona-1", price: 8, active: true });

    const res = await POST(
      req({ ...corpoBase, deliveryType: "DELIVERY", deliveryZoneId: "zona-1" })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ discount: 0, deliveryFee: 0, freeShipping: true });
  });

  it("recusa cupom de frete em pedido de retirada", async () => {
    couponFindUnique.mockResolvedValue(cupomFrete);
    const res = await POST(req(corpoBase));

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Este cupom é válido apenas para entrega." });
  });

  it("não marca freeShipping em cupom de valor", async () => {
    const res = await POST(req(corpoBase));
    expect(await res.json()).toMatchObject({ freeShipping: false });
  });

  it("recusa entrega sem bairro selecionado", async () => {
    const res = await POST(req({ ...corpoBase, deliveryType: "DELIVERY" }));

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Selecione o bairro de entrega." });
  });
});
