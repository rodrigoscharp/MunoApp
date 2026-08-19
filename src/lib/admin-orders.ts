import type { Prisma } from "@prisma/client";

/**
 * Achata o pedido do Prisma no formato que a tabela do admin consome.
 *
 * O motivo de existir: Server Component só entrega dado simples para Client
 * Component, e o Prisma devolve `Decimal` em toda coluna de dinheiro e `Date`
 * em toda data. A página fazia esta conversão inline e acertava em quase tudo —
 * total, deliveryFee, discount, unitPrice — mas passava `menuItem` cru, que
 * carrega `price: Decimal`. O React 19 reclamava a cada carregamento, e o
 * objeto chegava ao client sem os métodos do Decimal.
 *
 * Estar aqui, e não na página, é o que permite o teste ao lado prender a regra:
 * qualquer campo novo que não seja dado simples quebra o round-trip de JSON.
 */

type PedidoDoBanco = Prisma.OrderGetPayload<{
  include: {
    items: { include: { menuItem: true } };
    user: { select: { name: true; email: true } };
    table: { select: { number: true; name: true } };
  };
}>;

function serializarItemDoCardapio(menuItem: PedidoDoBanco["items"][number]["menuItem"]) {
  return {
    id: menuItem.id,
    name: menuItem.name,
    description: menuItem.description,
    price: Number(menuItem.price),
    imageUrl: menuItem.imageUrl,
    available: menuItem.available,
    categoryId: menuItem.categoryId,
  };
}

export function serializarPedidosDoAdmin(orders: PedidoDoBanco[]) {
  return orders.map((o) => ({
    id: o.id,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    deliveryType: o.deliveryType,
    total: Number(o.total),
    deliveryFee: Number(o.deliveryFee),
    discount: Number(o.discount),
    couponCode: o.couponCode,
    notes: o.notes,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    items: o.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      notes: item.notes,
      menuItem: serializarItemDoCardapio(item.menuItem),
    })),
    user: o.user,
    table: o.table,
  }));
}
