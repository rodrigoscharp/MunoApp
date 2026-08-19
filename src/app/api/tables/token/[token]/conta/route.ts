import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, getPlanoFromRequest, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { tenantTemMesaQr } from "@/lib/plans";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);
  if (!tenantTemMesaQr(getPlanoFromRequest(req))) {
    return apiError("Recurso não disponível neste plano", 403);
  }

  return withTenant(tenantId, async () => {
    const { token } = await params;

    const table = await prisma.table.findFirst({
      where: { token, active: true },
      select: { id: true, number: true, name: true },
    });

    if (!table) {
      return NextResponse.json({ error: "Mesa não encontrada" }, { status: 404 });
    }

    // `select` fechado, e não `include`. Esta rota é PÚBLICA — quem tem o QR da
    // mesa tem a conta, que é o desejado — mas `include` devolvia a linha
    // inteira de Order: telefone do cliente, endereço de entrega, observações,
    // userId, id de pagamento no gateway. Tudo isso para qualquer pessoa que
    // fotografasse o QR de uma mesa, sobre todos os pedidos abertos dela. A
    // conta precisa de nome, itens e valor; o resto nunca foi assunto dela.
    const orders = await prisma.order.findMany({
      where: { tableId: table.id, paymentStatus: "UNPAID", status: { not: "CANCELLED" } },
      select: {
        id: true,
        total: true,
        customerName: true,
        items: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            notes: true,
            menuItem: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ table: { number: table.number, name: table.name }, orders });
  });
}
