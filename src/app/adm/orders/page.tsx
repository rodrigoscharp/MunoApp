import { prismaUnscoped } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { AdminOrdersTable } from "@/components/adm/AdminOrdersTable";
import { serializarPedidosDoAdmin } from "@/lib/admin-orders";

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

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Pedidos</h1>
      <AdminOrdersTable orders={serializarPedidosDoAdmin(orders)} />
    </div>
  );
}
