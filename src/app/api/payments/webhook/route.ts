import { NextRequest, NextResponse } from "next/server";
import { prisma, prismaUnscoped } from "@/lib/prisma";
import { runWithTenant } from "@/lib/tenant-context";
import { getPaymentProvider } from "@/lib/payments/factory";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const signature = req.headers.get("x-signature");
    const requestId = req.headers.get("x-request-id");

    // Hoje só existe o provider Mercado Pago; quando outros providers
    // existirem, o tipo de evento no payload decide qual usar.
    const result = await getPaymentProvider().handleWebhook(body, signature, requestId);
    if (!result) return NextResponse.json({ received: true });

    // O webhook não vem pelo subdomínio do tenant (é a Mercado Pago batendo
    // numa URL global), então descobrimos o tenant a partir do próprio
    // pedido antes de entrar no contexto normal.
    const orderMeta = await prismaUnscoped.order.findUnique({
      where: { id: result.orderId },
      select: { tenantId: true },
    });
    if (!orderMeta) return NextResponse.json({ received: true });

    await runWithTenant(orderMeta.tenantId, async () => {
      if (result.status === "approved") {
        await prisma.order.update({
          where: { id: result.orderId },
          data: {
            paymentStatus: "PAID",
            status: "CONFIRMED",
            mpPaymentId: result.providerPaymentId,
          },
        });
      } else if (result.status === "rejected" || result.status === "cancelled") {
        await prisma.order.update({
          where: { id: result.orderId },
          data: { paymentStatus: "UNPAID" },
        });
      }
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}

// MP sends GET to validate the webhook URL
export async function GET() {
  return NextResponse.json({ ok: true });
}
