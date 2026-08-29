import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import {
  FILTRO_DE_RECEITA,
  diaBRT,
  inicioDeDiasAtrasBRT,
  inicioDoDiaBRT,
  inicioDoMesBRT,
} from "@/lib/faturamento";

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
    const startOfToday = inicioDoDiaBRT(now);
    // 29, não 30: a janela são 30 baldes contando **hoje** como o último. Com 30
    // o intervalo ia de D-30 a D-1, a consulta trazia os pedidos de hoje (o
    // `gte` os inclui) e o `key in dailyMap` lá embaixo os jogava fora sem
    // aviso — o gráfico do dono terminava sempre em ontem, e o movimento de hoje
    // não aparecia em barra nenhuma.
    const startOfWindow = inicioDeDiasAtrasBRT(now, 29);
    const startOfMonth = inicioDoMesBRT(now);

    const [todayStats, monthStats, last30Days, topItems, todayPayments, monthPayments] = await Promise.all([
      prisma.order.aggregate({
        where: { createdAt: { gte: startOfToday }, ...FILTRO_DE_RECEITA },
        _sum: { total: true },
        _count: true,
      }),
      prisma.order.aggregate({
        where: { createdAt: { gte: startOfMonth }, ...FILTRO_DE_RECEITA },
        _sum: { total: true },
        _count: true,
      }),
      prisma.order.findMany({
        where: { createdAt: { gte: startOfWindow }, ...FILTRO_DE_RECEITA },
        select: { createdAt: true, total: true },
      }),
      // Itens de pedido cancelado não foram vendidos. Sem o filtro, um pedido
      // grande cancelado empurrava o prato para o topo do ranking.
      prisma.orderItem.groupBy({
        by: ["menuItemId"],
        where: { order: { status: { not: "CANCELLED" } } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 10,
      }),
      prisma.payment.groupBy({
        by: ["method"],
        where: { createdAt: { gte: startOfToday } },
        _sum: { amount: true },
      }),
      prisma.payment.groupBy({
        by: ["method"],
        where: { createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
    ]);

    const toBreakdown = (rows: { method: string; _sum: { amount: unknown } }[]) => ({
      CASH: Number(rows.find((r) => r.method === "CASH")?._sum.amount ?? 0),
      CREDIT_CARD: Number(rows.find((r) => r.method === "CREDIT_CARD")?._sum.amount ?? 0),
      PIX: Number(rows.find((r) => r.method === "PIX")?._sum.amount ?? 0),
    });

    // As chaves são dias do calendário de Brasília nas duas pontas. Antes, os
    // baldes eram criados por `setDate` no fuso do servidor e os pedidos
    // classificados por `toISOString()` em UTC: o movimento das 21h à
    // meia-noite caía na barra do dia seguinte.
    const dailyMap: Record<string, number> = {};
    const UM_DIA_MS = 24 * 60 * 60 * 1000;
    for (let i = 0; i < 30; i++) {
      dailyMap[diaBRT(new Date(startOfWindow.getTime() + i * UM_DIA_MS))] = 0;
    }
    last30Days.forEach((order) => {
      const key = diaBRT(new Date(order.createdAt));
      if (key in dailyMap) dailyMap[key] += Number(order.total);
    });
    const dailySales = Object.entries(dailyMap).map(([date, revenue]) => ({ date, revenue }));

    const menuItemIds = topItems.map((i) => i.menuItemId);
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
      select: { id: true, name: true },
    });
    const topItemsWithNames = topItems.map((item) => ({
      name: menuItems.find((m) => m.id === item.menuItemId)?.name ?? "Desconhecido",
      quantity: item._sum.quantity ?? 0,
    }));

    return NextResponse.json({
      today: {
        revenue: Number(todayStats._sum.total ?? 0),
        orders: todayStats._count,
      },
      month: {
        revenue: Number(monthStats._sum.total ?? 0),
        orders: monthStats._count,
      },
      dailySales,
      topItems: topItemsWithNames,
      paymentBreakdown: {
        today: toBreakdown(todayPayments),
        month: toBreakdown(monthPayments),
      },
    });
  });
}
