import { prismaUnscoped } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { AdminOrdersTable } from "@/components/adm/AdminOrdersTable";
import { serializarPedidosDoAdmin } from "@/lib/admin-orders";
import { FILTRO_DE_RECEITA, inicioDoDiaBRT } from "@/lib/faturamento";

export default async function AdminOrdersPage() {
  const session = await auth();
  const tenantId = session!.user.tenantId;
  const inicioDeHoje = inicioDoDiaBRT(new Date());

  const [orders, pedidosDeHoje, receitaDeHoje] = await Promise.all([
    prismaUnscoped.order.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        items: { include: { menuItem: true } },
        user: { select: { name: true, email: true } },
        table: { select: { number: true, name: true } },
      },
    }),
    // O contexto do topo é do dia inteiro, não dos cem da lista: num sábado
    // cheio a lista corta antes do almoço e o número de hoje mentiria.
    prismaUnscoped.order.count({
      where: { tenantId, createdAt: { gte: inicioDeHoje }, NOT: { status: "CANCELLED" } },
    }),
    // A mesma regra de receita do dashboard (faturamento.ts): dois números de
    // "hoje" que discordam entre telas fazem o dono desconfiar dos dois.
    prismaUnscoped.order.aggregate({
      where: { tenantId, createdAt: { gte: inicioDeHoje }, ...FILTRO_DE_RECEITA },
      _sum: { total: true },
    }),
  ]);

  const ids = orders.map((o) => o.id);
  const clientes = [...new Set(orders.map((o) => o.userId).filter((u): u is string => !!u))];

  // Duas contagens agrupadas, uma ida cada, para o detalhe: "7º pedido" do
  // cliente e se o pedido tem conversa (o atalho para o chat só aparece aí).
  const [porCliente, comMensagem] = await Promise.all([
    clientes.length
      ? prismaUnscoped.order.groupBy({
          by: ["userId"],
          where: { tenantId, userId: { in: clientes } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prismaUnscoped.chatMessage.groupBy({
          by: ["orderId"],
          where: { tenantId, orderId: { in: ids } },
        })
      : Promise.resolve([]),
  ]);

  const pedidosPorCliente: Record<string, number> = {};
  for (const linha of porCliente) {
    if (linha.userId) pedidosPorCliente[linha.userId] = linha._count._all;
  }

  return (
    <AdminOrdersTable
      orders={serializarPedidosDoAdmin(orders)}
      hoje={{ pedidos: pedidosDeHoje, receita: Number(receitaDeHoje._sum.total ?? 0) }}
      pedidosPorCliente={pedidosPorCliente}
      comConversa={comMensagem.map((m) => m.orderId)}
    />
  );
}
