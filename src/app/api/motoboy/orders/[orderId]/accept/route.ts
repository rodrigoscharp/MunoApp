import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { broadcastOrderUpdate } from "@/lib/realtime";

interface Params {
  params: Promise<{ orderId: string }>;
}

// POST /api/motoboy/orders/[orderId]/accept — motoboy aceita o pedido
export async function POST(req: Request, { params }: Params) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (!session?.user || (session.user.role !== "MOTOBOY" && session.user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { orderId } = await params;

    // A tomada da corrida acontece numa única escrita condicional, e não em
    // "consultar, conferir, escrever". Dois motoboys tocando o botão no mesmo
    // segundo passavam os dois pela conferência de `motoboyId: null` e os dois
    // escreviam: o segundo UPDATE sobrescrevia o primeiro em silêncio, e a
    // mensagem "já foi aceito por outro motoboy" nunca aparecia para ninguém.
    // Duas pessoas saíam para a mesma entrega. Aqui só um dos dois recebe
    // count: 1 — o outro cai no ramo do 409, que agora é verdade.
    const { count } = await prisma.order.updateMany({
      where: {
        id: orderId,
        status: "READY",
        deliveryType: "DELIVERY",
        motoboyId: null,
      },
      data: {
        status: "OUT_FOR_DELIVERY",
        motoboyId: session.user.id,
      },
    });

    if (count === 0) {
      // A escrita não pegou. Descobrir o porquê é uma leitura barata e só
      // acontece no caminho de falha, que é raro.
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) {
        return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
      }
      if (order.motoboyId) {
        return NextResponse.json({ error: "Pedido já foi aceito por outro motoboy" }, { status: 409 });
      }
      return NextResponse.json({ error: "Pedido não disponível para entrega" }, { status: 400 });
    }

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    await broadcastOrderUpdate(tenantId, updated);

    return NextResponse.json(updated);
  });
}
