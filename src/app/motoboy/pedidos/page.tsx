import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prismaUnscoped } from "@/lib/prisma";
import { MotoboyOrdersList } from "@/components/motoboy/MotoboyOrdersList";

export default async function MotoboyPedidosPage() {
  const session = await auth();

  if (!session?.user || (session.user.role !== "MOTOBOY" && session.user.role !== "ADMIN")) {
    redirect("/motoboy/login");
  }

  // tenantId é opcional no tipo Session (a de plataforma não tem um); o guard
  // acima já garantiu sessão de restaurante com papel MOTOBOY ou ADMIN.
  const tenantId = session.user.tenantId!;
  const [activeDelivery, availableOrders] = await Promise.all([
    prismaUnscoped.order.findFirst({
      where: {
        tenantId,
        motoboyId: session.user.id,
        status: "OUT_FOR_DELIVERY",
      },
    }),
    prismaUnscoped.order.findMany({
      where: {
        tenantId,
        status: "READY",
        deliveryType: "DELIVERY",
        motoboyId: null,
      },
      include: {
        items: { include: { menuItem: { select: { name: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <MotoboyOrdersList
      tenantId={tenantId}
      availableOrders={availableOrders.map((o) => ({
        id: o.id,
        customerName: o.customerName,
        deliveryAddress: o.deliveryAddress,
        total: Number(o.total),
        createdAt: o.createdAt,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        items: o.items.map((i) => ({ name: i.menuItem.name, quantity: i.quantity })),
      }))}
      activeDelivery={
        activeDelivery
          ? {
              id: activeDelivery.id,
              deliveryAddress: activeDelivery.deliveryAddress,
              customerName: activeDelivery.customerName,
              total: Number(activeDelivery.total),
            }
          : null
      }
    />
  );
}
