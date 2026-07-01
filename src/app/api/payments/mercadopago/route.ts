import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { getPaymentProviderForTenant } from "@/lib/payments/factory";
import { z } from "zod";

const schema = z.object({
  orderId: z.string(),
  paymentMethod: z.enum(["PIX", "CREDIT_CARD"]),
  customerName: z.string(),
});

export async function POST(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, () => handlePost(req, tenantId));
}

async function handlePost(req: NextRequest, tenantId: string) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { orderId, paymentMethod, customerName } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { menuItem: true } } },
  });

  if (!order) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  try {
    const { provider, connection } = await getPaymentProviderForTenant(tenantId);

    const charge = await provider.createCharge(
      {
        id: order.id,
        total: Number(order.total),
        customerName,
        paymentMethod,
        items: order.items.map((item) => ({
          menuItemId: item.menuItemId,
          name: item.menuItem.name,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
        })),
      },
      connection
    );

    await prisma.order.update({
      where: { id: orderId },
      data: { mpPaymentId: charge.paymentId },
    });

    return NextResponse.json({
      pixQrCode: charge.pixQrCode,
      pixCopyPaste: charge.pixCopyPaste,
      checkoutUrl: charge.checkoutUrl,
      paymentId: charge.paymentId,
    });
  } catch (err) {
    console.error("Mercado Pago error:", err);
    return NextResponse.json({ error: "Erro ao criar pagamento" }, { status: 500 });
  }
}
