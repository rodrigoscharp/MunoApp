import { prisma } from "@/lib/prisma";
import { AdminOrdersTable } from "@/components/adm/AdminOrdersTable";

export default async function AdminOrdersPage() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      items: { include: { menuItem: true } },
      user: { select: { name: true, email: true } },
      table: { select: { number: true, name: true } },
    },
  });

  const serialized = orders.map((o) => ({
    id: o.id,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    deliveryType: o.deliveryType,
    total: Number(o.total),
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
      menuItem: item.menuItem,
    })),
    user: o.user,
    table: o.table,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Pedidos</h1>
      <AdminOrdersTable orders={serialized} />
    </div>
  );
}
