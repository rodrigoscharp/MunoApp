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

    // Mesa e pedidos numa consulta só: a página da mesa consulta esta rota em
    // polling, e eram duas idas ao banco em série a cada ciclo. A mesa no topo
    // é escopada pela extensão do Prisma; os pedidos aninhados não passam por
    // ela, e por isso o tenantId vai explícito no where deles. A foreign key de
    // tableId é global, e pedido antigo de outra casa apontando para esta mesa
    // (o bug que o POST de pedidos fechou) não pode entrar na conta.
    //
    // `select` fechado, e não `include`. Esta rota é PÚBLICA — quem tem o QR da
    // mesa tem a conta, que é o desejado — mas `include` devolvia a linha
    // inteira de Order: telefone do cliente, endereço de entrega, observações,
    // userId, id de pagamento no gateway. Tudo isso para qualquer pessoa que
    // fotografasse o QR de uma mesa, sobre todos os pedidos abertos dela. A
    // conta precisa de nome, itens e valor; o resto nunca foi assunto dela.
    const table = await prisma.table.findFirst({
      where: { token, active: true },
      select: {
        number: true,
        name: true,
        orders: {
          where: { tenantId, paymentStatus: "UNPAID", status: { not: "CANCELLED" } },
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
        },
      },
    });

    if (!table) {
      return NextResponse.json({ error: "Mesa não encontrada" }, { status: 404 });
    }

    return NextResponse.json({
      table: { number: table.number, name: table.name },
      orders: table.orders,
    });
  });
}
