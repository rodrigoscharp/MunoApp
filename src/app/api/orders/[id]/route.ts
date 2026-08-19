import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { broadcastOrderUpdate } from "@/lib/realtime";
import { canViewOrder } from "@/lib/order-access";
import { z } from "zod";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const { id } = await params;
    const session = await auth();

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { menuItem: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    // 404 em vez de 403 de propósito: um 403 confirmaria que o pedido existe,
    // que é metade do valor de um IDOR.
    if (!order || !canViewOrder(order, session?.user ?? null)) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    return NextResponse.json(order);
  });
}

const updateSchema = z.object({
  // A lista espelha o enum OrderStatus do schema.prisma. OUT_FOR_DELIVERY
  // faltava: é o status que a cozinha grava ao mandar um delivery para a rua, e
  // sem ele o botão "Saiu p/ entrega" tomava 400. Só a rota de aceite do
  // motoboy chegava lá, escrevendo direto no banco sem passar por aqui.
  status: z
    .enum([
      "PENDING",
      "CONFIRMED",
      "IN_PREPARATION",
      "READY",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "CANCELLED",
    ])
    .optional(),
  paymentStatus: z.enum(["UNPAID", "PAID", "REFUNDED"]).optional(),
  mpPaymentId: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (!session || (session.user.role !== "ADMIN" && session.user.role !== "KITCHEN")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const order = await prisma.order.update({
      where: { id },
      data: parsed.data,
      include: { items: { include: { menuItem: true } } },
    });

    await broadcastOrderUpdate(tenantId, order);

    return NextResponse.json(order);
  });
}
