import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { getActiveConnection, getPaymentProvider } from "@/lib/payments/factory";
import { extractErrorMessage } from "@/lib/error-message";
import { z } from "zod";

const schema = z.object({
  orderId: z.string(),
  paymentMethod: z.enum(["PIX", "CREDIT_CARD"]),
  customerName: z.string(),
  // CPF do pagador, exigido só por alguns gateways. Não é persistido:
  // atravessa daqui pro adapter e morre com a request.
  payerDocument: z.string().optional(),
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

  const { orderId, paymentMethod, customerName, payerDocument } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { menuItem: true } } },
  });

  if (!order) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  // Sem conexão ativa, o lojista não tem gateway configurado (ou o
  // configurado ainda não passou pela validação/webhook inicial) — sem
  // fallback para conta de plataforma neste modo self-service.
  const connection = await getActiveConnection(tenantId);
  if (!connection) {
    return NextResponse.json(
      { error: "Este restaurante não aceita pagamento online no momento." },
      { status: 409 }
    );
  }

  const provider = getPaymentProvider(connection.provider);

  // O gateway conectado pode não cobrir o método pedido. A UI já filtra,
  // mas esta rota é alcançável direto — sem esta checagem, um gateway de
  // PIX puro receberia um pedido marcado como cartão.
  if (!provider.meta.methods.includes(paymentMethod)) {
    return NextResponse.json(
      { error: "Este restaurante não aceita essa forma de pagamento no momento." },
      { status: 422 }
    );
  }

  try {

    const charge = await provider.createCharge(
      {
        id: order.id,
        total: Number(order.total),
        customerName,
        payerDocument,
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
    // Só a mensagem — o erro pode embutir o corpo da request (que inclui
    // o access_token usado na chamada).
    console.error("Payment error:", extractErrorMessage(err));

    // O pedido foi criado antes da cobrança. Se a cobrança falhou, ele não
    // pode ficar de pé: apareceria na cozinha como pedido a preparar, sem
    // ninguém ter pago. Cancelar deixa o rastro sem virar comida perdida.
    await prisma.order
      .update({ where: { id: orderId }, data: { status: "CANCELLED" } })
      .catch((cancelErr) =>
        console.error("Falha ao cancelar pedido sem cobrança:", extractErrorMessage(cancelErr))
      );

    return NextResponse.json(
      { error: "Não foi possível iniciar o pagamento. O pedido foi cancelado." },
      { status: 500 }
    );
  }
}
