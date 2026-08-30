import { redirect } from "next/navigation";
import { prismaUnscoped } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getRestaurantInfo } from "@/lib/restaurant";
import {
  ONBOARDING_DISPENSADO,
  deveRedirecionar,
  estaPendente,
} from "@/lib/onboarding";
import { formatCurrency } from "@/lib/utils";
import { FILTRO_DE_RECEITA, inicioDoDiaBRT, inicioDoMesBRT } from "@/lib/faturamento";
import { AdminCharts } from "@/components/adm/AdminCharts";

export default async function AdminDashboard() {
  const session = await auth();
  // tenantId é opcional no tipo Session (a sessão de plataforma não tem um);
  // aqui o proxy já garantiu um ADMIN de tenant antes de a página rodar.
  const tenantId = session!.user.tenantId!;
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

  // O estado do onboarding sai dos DADOS, e metade dele já estava aqui:
  // menuItemCount é calculado acima para o card de cardápio.
  const [info, dispensa] = await Promise.all([
    getRestaurantInfo(tenantId),
    prismaUnscoped.setting.findUnique({
      where: { tenantId_key: { tenantId, key: ONBOARDING_DISPENSADO } },
      select: { value: true },
    }),
  ]);
  const onboarding = {
    enderecoPreenchido: info.address.trim().length > 0,
    temItem: menuItemCount > 0,
    dispensado: dispensa !== null,
  };

  // O redirecionamento mora AQUI, e não no proxy. O proxy roda em toda
  // requisição e já faz um findUnique de tenant; somar duas consultas ali por
  // uma tela que cada cliente vê uma vez na vida é caro no lugar errado. E o
  // efeito seria pior: quem digita /adm/cardapio direto seria sequestrado no
  // meio do caminho. Aqui só pega quem chega na porta do painel.
  if (deveRedirecionar(onboarding)) redirect("/adm/comecar");

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900 mb-1">Dashboard</h1>
      <p className="text-sm text-neutral-400 mb-6">Resultados e métricas do restaurante</p>

      {/* Aparece mesmo com a dispensa gravada: adiar desliga o
          redirecionamento, não o lembrete. Some sozinho quando a casa estiver
          montada, porque a condição é derivada dos dados. */}
      {estaPendente(onboarding) && (
        <div className="mb-8 rounded-2xl border border-brand-muted bg-brand-light p-5">
          <p className="text-sm font-semibold text-forest-dark">
            Sua casa ainda não está pronta para vender.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-neutral-600">
            {!onboarding.enderecoPreenchido && (
              <li>Falta o endereço, que aparece no cardápio dos seus clientes.</li>
            )}
            {!onboarding.temItem && (
              <li>Falta o primeiro item do cardápio.</li>
            )}
          </ul>
          <a
            href="/adm/comecar"
            className="mt-4 inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            Terminar de configurar
          </a>
        </div>
      )}

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
