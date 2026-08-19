import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { serializarPedidosDoAdmin } from "@/lib/admin-orders";

// Fixture completo de propósito: o tipo do payload do Prisma é o que garante
// que este teste vê os mesmos campos que a página recebe em produção — inclusive
// os que ainda não são serializados.
function pedido(): Parameters<typeof serializarPedidosDoAdmin>[0][number] {
  return {
    id: "order-1",
    tenantId: "tenant-1",
    status: "PENDING",
    paymentMethod: "CASH",
    paymentStatus: "UNPAID",
    mpPaymentId: null,
    total: new Prisma.Decimal("114.60"),
    notes: null,
    customerName: "Cliente",
    customerPhone: "11999998888",
    deliveryType: "DELIVERY",
    deliveryAddress: "Rua das Flores, 100",
    deliveryFee: new Prisma.Decimal("5.00"),
    discount: new Prisma.Decimal("0.00"),
    couponId: null,
    couponCode: null,
    estimatedDeliveryAt: null,
    userId: "user-1",
    motoboyId: null,
    tableId: null,
    createdAt: new Date("2026-08-19T12:00:00Z"),
    updatedAt: new Date("2026-08-19T12:30:00Z"),
    items: [
      {
        id: "item-1",
        tenantId: "tenant-1",
        orderId: "order-1",
        menuItemId: "menu-1",
        quantity: 2,
        unitPrice: new Prisma.Decimal("22.90"),
        notes: null,
        menuItem: {
          id: "menu-1",
          tenantId: "tenant-1",
          name: "X-Burguer",
          description: "Pão brioche",
          price: new Prisma.Decimal("22.90"),
          imageUrl: null,
          available: true,
          categoryId: "cat-1",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
      },
    ],
    user: { name: "Cliente", email: "c@x.com" },
    table: null,
  };
}

describe("serializarPedidosDoAdmin", () => {
  it("converte os valores do pedido para número", () => {
    const [saida] = serializarPedidosDoAdmin([pedido()]);

    expect(saida.total).toBe(114.6);
    expect(saida.deliveryFee).toBe(5);
    expect(saida.items[0].unitPrice).toBe(22.9);
  });

  /**
   * O bug: a página convertia total, deliveryFee, discount e unitPrice com
   * Number(), mas passava `menuItem` cru — e ele carrega `price` como Decimal.
   * React 19 recusa objeto de classe atravessando Server → Client Component.
   */
  it("converte também o preço dentro de menuItem", () => {
    const [saida] = serializarPedidosDoAdmin([pedido()]);

    expect(saida.items[0].menuItem.price).toBe(22.9);
    expect(typeof saida.items[0].menuItem.price).toBe("number");
  });

  // Rede de segurança para campo novo: se algo que não é dado simples escapar,
  // o round-trip de JSON muda o valor (Decimal vira string, Date vira string).
  it("devolve estrutura que sobrevive a um round-trip de JSON", () => {
    const saida = serializarPedidosDoAdmin([pedido()]);

    expect(JSON.parse(JSON.stringify(saida))).toEqual(saida);
  });
});
