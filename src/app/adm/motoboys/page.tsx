import { prismaUnscoped } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { inicioDoDiaBRT } from "@/lib/faturamento";
import { MotoboyAccessControl } from "@/components/adm/MotoboyAccessControl";

export default async function MotoboyAccessPage() {
  const session = await auth();
  const tenantId = session!.user.tenantId;

  // As entregas do dia são uma contagem agrupada, servida pelo índice
  // [tenantId, status, createdAt]. Não há coluna de "entregue em": conta o
  // pedido de hoje que já está DELIVERED, e um pedido de 23:50 entregue depois
  // da meia-noite fica no dia anterior. Para o dono olhar o movimento, basta.
  const [motoboys, entregas] = await Promise.all([
    prismaUnscoped.user.findMany({
      where: { role: "MOTOBOY", tenantId },
      select: { id: true, name: true, email: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prismaUnscoped.order.groupBy({
      by: ["motoboyId"],
      where: {
        tenantId,
        status: "DELIVERED",
        motoboyId: { not: null },
        createdAt: { gte: inicioDoDiaBRT(new Date()) },
      },
      _count: { _all: true },
    }),
  ]);

  const entregasHoje: Record<string, number> = {};
  for (const e of entregas) {
    if (e.motoboyId) entregasHoje[e.motoboyId] = e._count._all;
  }

  return (
    <MotoboyAccessControl
      initialMotoboys={motoboys.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
      entregasHoje={entregasHoje}
    />
  );
}
