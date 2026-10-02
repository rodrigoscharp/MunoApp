import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { broadcastOrderUpdate } from "@/lib/realtime";
import { canViewOrder } from "@/lib/order-access";
import { transicaoPermitida } from "@/lib/kitchen-flow";
import { reportarErro } from "@/lib/observabilidade";
import type { DeliveryType, OrderStatus } from "@/types";
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

    // Pedido sem dono (mesa, anônimo) é legível por quem tiver o link, e o id
    // não é segredo: aparece em canal de tempo real e na conta da mesa. Quem
    // não é dono nem equipe do restaurante recebe o pedido sem telefone, sem
    // id do pagamento no gateway e sem os dados do usuário.
    const role = session?.user?.role;
    const eEquipe = role === "ADMIN" || role === "KITCHEN";
    const eDono = !!order.userId && order.userId === session?.user?.id;
    if (!eEquipe && !eDono) {
      const {
        customerPhone: _t,
        customerName: _n,
        notes: _o,
        mpPaymentId: _p,
        user: _u,
        ...publico
      } = order;
      return NextResponse.json(publico);
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
    const body = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    // Quem prepara o pedido não mexe em dinheiro: marcar PAID ou REFUNDED, ou
    // trocar o id do pagamento no gateway, é do dono do restaurante.
    if (
      session.user.role !== "ADMIN" &&
      (parsed.data.paymentStatus !== undefined || parsed.data.mpPaymentId !== undefined)
    ) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const atual = await prisma.order.findUnique({
      where: { id },
      select: { status: true, deliveryType: true, paymentStatus: true, paymentMethod: true },
    });
    if (!atual) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    const novoStatus = parsed.data.status;
    if (
      novoStatus &&
      !transicaoPermitida(
        atual.status as OrderStatus,
        novoStatus as OrderStatus,
        atual.deliveryType as DeliveryType
      )
    ) {
      return NextResponse.json(
        { error: `Não é possível mudar o pedido de ${atual.status} para ${novoStatus}.` },
        { status: 409 }
      );
    }

    // Grava só se o pedido ainda está no status que foi lido: duas telas da
    // cozinha (ou a cozinha e o motoboy) agindo ao mesmo tempo não se
    // sobrescrevem, a que chega depois recebe 409 e recarrega.
    const gravou = await prisma.order.updateMany({
      where: { id, ...(novoStatus ? { status: atual.status } : {}) },
      data: parsed.data,
    });
    if (gravou.count === 0) {
      return NextResponse.json(
        { error: "O pedido mudou enquanto você olhava. Atualize a tela." },
        { status: 409 }
      );
    }

    // Cancelar o que o cliente já pagou online não devolve o dinheiro: o
    // estorno é manual no gateway, e este alerta é o que lembra alguém.
    if (
      novoStatus === "CANCELLED" &&
      atual.status !== "CANCELLED" &&
      atual.paymentStatus === "PAID" &&
      atual.paymentMethod !== "CASH"
    ) {
      console.error(`[orders] pedido pago online cancelado, estornar: tenant=${tenantId} order=${id}`);
      await reportarErro({
        origem: "orders:cancelado-pago",
        erro: "pedido pago online foi cancelado, estornar no gateway",
        extra: { tenantId, orderId: id },
      });
    }

    const order = await prisma.order.findFirst({
      where: { id },
      include: { items: { include: { menuItem: true } } },
    });
    if (!order) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    await broadcastOrderUpdate(tenantId, order);

    return NextResponse.json(order);
  });
}
