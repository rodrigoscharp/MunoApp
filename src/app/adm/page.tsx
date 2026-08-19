import { prismaUnscoped } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";
import { FILTRO_DE_RECEITA, inicioDoDiaBRT, inicioDoMesBRT } from "@/lib/faturamento";
import { AdminCharts } from "@/components/adm/AdminCharts";

export default async function AdminDashboard() {
  const session = await auth();
  const tenantId = session!.user.tenantId;
  // "Hoje" e "receita" vêm de src/lib/faturamento.ts, o mesmo módulo que
  // /api/analytics usa: os cards e o gráfico logo abaixo deles precisam
  // responder a mesma pergunta do mesmo jeito.
  const agora = new Date();
  const todayBRT = inicioDoDiaBRT(agora);
  const startOfMonthBRT = inicioDoMesBRT(agora);

  const [todayStats, monthStats, menuItemCount, pendingOrders] = await Promise.all([
    prismaUnscoped.order.aggregate({
      where: { tenantId, createdAt: { gte: todayBRT }, ...FILTRO_DE_RECEITA },
      _sum: { total: true },
      _count: true,
    }),
    prismaUnscoped.order.aggregate({
      where: { tenantId, createdAt: { gte: startOfMonthBRT }, ...FILTRO_DE_RECEITA },
      _sum: { total: true },
      _count: true,
    }),
    prismaUnscoped.menuItem.count({ where: { tenantId } }),
    prismaUnscoped.order.count({
      where: { tenantId, status: { in: ["PENDING", "CONFIRMED", "IN_PREPARATION"] } },
    }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900 mb-1">Dashboard</h1>
      <p className="text-sm text-neutral-400 mb-6">Resultados e métricas do restaurante</p>

      {/* Metric cards */}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">Receita Hoje</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {formatCurrency(Number(todayStats._sum.total ?? 0))}
          </p>
          <p className="text-xs text-neutral-400 mt-0.5">{todayStats._count} pedidos entregues</p>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">Receita do Mês</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {formatCurrency(Number(monthStats._sum.total ?? 0))}
          </p>
          <p className="text-xs text-neutral-400 mt-0.5">{monthStats._count} pedidos entregues</p>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">Em Aberto</p>
          <p className="text-2xl font-bold text-orange-500 mt-1">{pendingOrders}</p>
          <p className="text-xs text-neutral-400 mt-0.5">pedidos ativos</p>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">Itens no Cardápio</p>
          <p className="text-2xl font-bold text-neutral-900 mt-1">{menuItemCount}</p>
          <p className="text-xs text-neutral-400 mt-0.5">itens cadastrados</p>
        </div>
      </div>

      {/* Charts */}
      <div className="mb-8">
        <AdminCharts />
      </div>
    </div>
  );
}
