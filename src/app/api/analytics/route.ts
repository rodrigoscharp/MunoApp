import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { graficosEmCache } from "@/lib/analytics";
import { FILTRO_DE_RECEITA, inicioDoDiaBRT, inicioDoMesBRT } from "@/lib/faturamento";

export async function GET(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (session?.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    // Tudo em fuso de Brasília, e com a mesma definição de receita dos cards de
    // /adm (src/lib/faturamento.ts). Antes daqui, `setHours(0,0,0,0)` num
    // servidor em UTC punha "hoje" três horas adiantado, e o filtro contava só
    // pedido pré-pago — dinheiro recebido na entrega não entrava no gráfico.
    const now = new Date();

    // Os gráficos saem de src/lib/analytics.ts, a mesma conta (e o mesmo
    // cache) que a página do painel usa no servidor. A rota só acrescenta os
    // totais de hoje e do mês, que o painel já tira dos próprios cards.
    const [todayStats, monthStats, graficos] = await Promise.all([
      prisma.order.aggregate({
        where: { createdAt: { gte: inicioDoDiaBRT(now) }, ...FILTRO_DE_RECEITA },
        _sum: { total: true },
        _count: true,
      }),
      prisma.order.aggregate({
        where: { createdAt: { gte: inicioDoMesBRT(now) }, ...FILTRO_DE_RECEITA },
        _sum: { total: true },
        _count: true,
      }),
      graficosEmCache(tenantId),
    ]);

    return NextResponse.json({
      today: {
        revenue: Number(todayStats._sum.total ?? 0),
        orders: todayStats._count,
      },
      month: {
        revenue: Number(monthStats._sum.total ?? 0),
        orders: monthStats._count,
      },
      ...graficos,
    });
  });
}
