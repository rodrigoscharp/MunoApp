import { prismaUnscoped } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { AdminChatsClient } from "./AdminChatsClient";

export default async function AdminChatsPage() {
  const session = await auth();

  // tenantId é opcional no tipo Session (a sessão de plataforma não tem um);
  // aqui o proxy já garantiu sessão de restaurante com papel ADMIN.
  const ordersWithChats = await prismaUnscoped.order.findMany({
    where: { tenantId: session!.user.tenantId!, chatMessages: { some: {} } },
    include: {
      chatMessages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      user: { select: { name: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
    // status já vem pelo include implícito do select *
  });

  return (
    <AdminChatsClient
      orders={ordersWithChats}
      adminName={session?.user?.name ?? "Admin"}
      tenantId={session!.user.tenantId!}
    />
  );
}
