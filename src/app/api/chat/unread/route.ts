import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";

// Mais do que isso não cabe num sino: são avisos, e a conversa inteira continua
// em /api/orders/[id]/chat.
const LIMITE_DO_SINO = 50;

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
    // Sem `since` (primeira chamada do sino), só os últimos 7 dias: antes saía
    // toda mensagem do admin que o cliente já recebeu na vida, a cada abertura.
    const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Com teto. Sem ele, a resposta crescia com o que o restaurante escrevesse
    // desde o cursor, e um sino que ficou dias fechado recebia tudo de uma vez,
    // de minuto em minuto até alcançar. As mais recentes (desc + take), em ordem
    // de chegada: o sino avança o cursor para a última, então as que ficaram de
    // fora são as velhas, que já não valem notificação. O índice
    // [tenantId, senderRole, createdAt] serve exatamente este where.
    const recentes = await prisma.chatMessage.findMany({
      where: {
        senderRole: "ADMIN",
        order: { userId: session.user.id },
        createdAt: { gt: desde ?? seteDiasAtras },
      },
      orderBy: { createdAt: "desc" },
      take: LIMITE_DO_SINO,
      select: {
        id: true,
        orderId: true,
        content: true,
        createdAt: true,
      },
    });

    return NextResponse.json(recentes.reverse());
  });
}
