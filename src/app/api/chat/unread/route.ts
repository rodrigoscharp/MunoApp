import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";

/**
 * GET /api/chat/unread?since=<ISO timestamp>
 * Retorna mensagens de ADMIN (restaurante) enviadas após `since`
 * nos pedidos ativos do usuário autenticado.
 */
export async function GET(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // `since` vem da query string e ia direto para `new Date()`. Qualquer texto
    // que não seja data vira Invalid Date, que o Prisma rejeita com um erro de
    // driver — 500 numa rota que o sino de notificações chama de minuto em
    // minuto. Data ilegível é tratada como ausente: devolve tudo, que é o
    // comportamento já previsto para a primeira chamada.
    const sinceParam = req.nextUrl.searchParams.get("since");
    const since = sinceParam ? new Date(sinceParam) : null;
    const desde = since && !Number.isNaN(since.getTime()) ? since : null;

    const messages = await prisma.chatMessage.findMany({
      where: {
        senderRole: "ADMIN",
        order: { userId: session.user.id },
        ...(desde ? { createdAt: { gt: desde } } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        orderId: true,
        content: true,
        createdAt: true,
      },
    });

    return NextResponse.json(messages);
  });
}
