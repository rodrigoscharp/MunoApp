import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { canViewOrder } from "@/lib/order-access";
import { KITCHEN_CHANNEL, orderChannel, userChannel } from "@/lib/realtime-channel";
import { topicoSeguro } from "@/lib/realtime-topic";

/**
 * Entrega o nome secreto de um canal de tempo real a quem tem direito de ouvi-lo
 * (ver realtime-topic.ts). Sem isto o nome seria montável por qualquer um que
 * soubesse o tenantId.
 *
 *   canal=kitchen          equipe do restaurante (ADMIN, KITCHEN, MOTOBOY)
 *   canal=order&id=<id>    quem pode ver aquele pedido (mesma regra da leitura)
 *   canal=user             sempre o canal do próprio usuário logado
 */
export async function GET(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    const canal = req.nextUrl.searchParams.get("canal");
    const id = req.nextUrl.searchParams.get("id");
    const resposta = (nome: string) =>
      NextResponse.json({ topic: topicoSeguro(tenantId, nome) }, { headers: { "Cache-Control": "no-store" } });

    if (canal === "kitchen") {
      const role = session?.user?.role;
      if (role !== "ADMIN" && role !== "KITCHEN" && role !== "MOTOBOY") {
        return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
      }
      return resposta(KITCHEN_CHANNEL);
    }

    if (canal === "order") {
      if (!id) return apiError("Informe o pedido", 400);
      const order = await prisma.order.findUnique({ where: { id }, select: { userId: true } });
      // 404 e não 403, como em GET /api/orders/[id]: não confirma que existe.
      if (!order || !canViewOrder(order, session?.user ?? null)) {
        return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
      }
      return resposta(orderChannel(id));
    }

    if (canal === "user") {
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
      }
      return resposta(userChannel(session.user.id));
    }

    return apiError("Canal inválido", 400);
  });
}
