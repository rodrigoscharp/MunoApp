import { NextRequest, NextResponse } from "next/server";
import { prisma, prismaUnscoped } from "@/lib/prisma";
import { runWithTenant } from "@/lib/tenant-context";
import { getPaymentProvider } from "@/lib/payments/factory";
import { InvalidWebhookSignatureError } from "@/lib/payments/types";
import { broadcastTenantEvent } from "@/lib/realtime";
import { extractErrorMessage } from "@/lib/error-message";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string; tenantId: string }> }
) {
  const { provider: providerId, tenantId } = await params;

  try {
    // O tenantId vem da URL, que é PÚBLICA e não autentica nada — só serve
    // pra localizar a conexão. Quem autentica é a assinatura verificada
    // dentro de handleWebhook(), com o segredo daquele lojista.
    const connection = await prismaUnscoped.paymentConnection.findUnique({
      where: { tenantId_provider: { tenantId, provider: providerId } },
    });
    // Não revela se o tenant/provider existe — resposta idêntica em
    // qualquer caso de "nada a fazer".
    if (!connection) return NextResponse.json({ received: true });

    const body = await req.json();

    let result;
    try {
      result = await getPaymentProvider(providerId).handleWebhook(body, req.headers, connection);
    } catch (err) {
      if (err instanceof InvalidWebhookSignatureError) {
        return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
      }
      throw err;
    }
    if (!result) return NextResponse.json({ received: true });

    // Assinatura validada: é a única prova possível de que o webhook secret
    // colado pelo lojista está correto (não dá pra verificar isso por API).
    await prismaUnscoped.paymentConnection.update({
      where: { id: connection.id },
      data: { lastCheckedAt: new Date() },
    });

    // O tenant já vem da URL e foi validado pela assinatura — não é mais
    // preciso descobri-lo pelo orderId. Toda leitura/escrita do pedido
    // acontece dentro do contexto do tenant, pra notificação de um tenant
    // nunca alcançar o pedido de outro.
    await runWithTenant(tenantId, async () => {
      let order;

      if (result.status === "approved") {
        order = await prisma.order.update({
          where: { id: result.orderId },
          data: {
            paymentStatus: "PAID",
            status: "CONFIRMED",
            mpPaymentId: result.providerPaymentId,
          },
        });
      } else if (result.status === "rejected" || result.status === "cancelled") {
        order = await prisma.order.update({
          where: { id: result.orderId },
          data: { paymentStatus: "UNPAID" },
        });
      } else if (result.status === "refunded") {
        order = await prisma.order.update({
          where: { id: result.orderId },
          data: { paymentStatus: "REFUNDED" },
        });
      }

      if (order) {
        await broadcastTenantEvent(tenantId, `order:${result.orderId}`, "order-updated", {
          status: order.status,
          updatedAt: order.updatedAt.toISOString(),
          estimatedDeliveryAt: order.estimatedDeliveryAt?.toISOString() ?? null,
        });
        await broadcastTenantEvent(tenantId, "kitchen-orders", "order-updated", { orderId: result.orderId });
      }
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    // Qualquer falha genérica (ex.: blob de credenciais corrompido ou chave
    // de criptografia rotacionada, que faz decryptCredentials lançar Error
    // comum) precisa virar 500 — nunca 200. Reportar "received" pro gateway
    // quando na verdade falhamos esconderia um problema real.
    console.error("Webhook error:", extractErrorMessage(err));
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}

// O gateway manda GET pra validar a URL de notificação.
export async function GET() {
  return NextResponse.json({ ok: true });
}
