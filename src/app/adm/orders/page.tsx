import { prismaUnscoped } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { AdminOrdersTable } from "@/components/adm/AdminOrdersTable";

export default async function AdminOrdersPage() {
  const session = await auth();
  const orders = await prismaUnscoped.order.findMany({
    where: { tenantId: session!.user.tenantId },
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
