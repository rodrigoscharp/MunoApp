import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { broadcastTenantEvent } from "@/lib/realtime";
import { orderChannel, userChannel } from "@/lib/realtime-channel";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

// 2000 é o mesmo teto do histórico enviado à IA em /api/ai/menu-recommendation.
// Mensagem de chat de pedido não chega perto disso; o limite existe para o
// campo não ser um depósito de texto arbitrário no banco.
const mensagemSchema = z.object({ content: z.string().max(2000) });

export async function GET(req: NextRequest, { params }: Params) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const { id } = await params;
    const session = await auth();

    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    // Apenas o dono do pedido ou um admin podem ler o chat
    const isAdmin = session?.user.role === "ADMIN";
    const isOwner = session?.user.id === order.userId;

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { orderId: id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(messages);
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const { id } = await params;
    const session = await auth();

    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    const isAdmin = session?.user.role === "ADMIN";
    const isOwner = session?.user.id === order.userId;

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    // `(body.content ?? "").trim()` cobria só o campo ausente: `content: 123`
    // chamava .trim() num número e derrubava a rota em 500. E o texto entrava no
    // banco sem teto de tamanho — a única entrada livre do app sem limite.
    const parsed = mensagemSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Mensagem inválida" }, { status: 400 });
    }
    const content = parsed.data.content.trim();

    if (!content) {
      return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 });
    }

    const message = await prisma.chatMessage.create({
      data: {
        tenantId,
        orderId: id,
        senderRole: isAdmin ? "ADMIN" : "CUSTOMER",
        senderId: session?.user.id ?? null,
        senderName: session?.user.name ?? null,
        content,
      },
    });

    // Só o aviso, sem o conteúdo: canal Broadcast não é autorizado por padrão,
    // então o texto da conversa continua saindo apenas pelo GET acima, que
    // confere dono/admin. O assinante recebe o ping e vai buscar.
    const aviso = {
      orderId: id,
      messageId: message.id,
      senderRole: message.senderRole,
    };

    await Promise.all([
      // Canal do pedido: a janela de chat aberta dos dois lados.
      broadcastTenantEvent(tenantId, orderChannel(id), "chat-message", aviso),
      // Canal do cliente: o sino, que não tem a conversa aberta. Só faz sentido
      // quando quem falou foi o restaurante e o pedido tem dono.
      ...(isAdmin && order.userId
        ? [
            broadcastTenantEvent(
              tenantId,
              userChannel(order.userId),
              "chat-message",
              aviso
            ),
          ]
        : []),
    ]);

    return NextResponse.json(message, { status: 201 });
  });
}
