import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getPlanoFromRequest, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { tenantTemMesaQr } from "@/lib/plans";
import { z } from "zod";

const closeBillSchema = z.object({
  payments: z
    .array(
      z.object({
        method: z.enum(["PIX", "CREDIT_CARD", "CASH"]),
        amount: z.number().positive(),
      })
    )
    .min(1),
});

class ContaMudouError extends Error {}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);
  if (!tenantTemMesaQr(getPlanoFromRequest(req))) {
    return apiError("Recurso não disponível neste plano", 403);
  }

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = closeBillSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }
    const { payments } = parsed.data;

    // Tudo numa transação interativa: ler o que está em aberto, conferir a
    // soma e quitar são um passo só. Lido fora dela, um pedido novo da mesa que
    // entrasse entre a leitura e a gravação era marcado como pago sem estar na
    // conta, e duas chamadas simultâneas criavam os Payment em dobro.
    //
    // Quita exatamente os pedidos que foram somados (por id): o que chegar
    // depois fica em aberto para a próxima conta.
    const resultado = await prisma.$transaction(async (tx) => {
      const openOrders = await tx.order.findMany({
        where: { tableId: id, paymentStatus: "UNPAID", status: { not: "CANCELLED" } },
        select: { id: true, total: true },
      });

      if (openOrders.length === 0) {
        return { erro: "Nenhum pedido em aberto nesta mesa" } as const;
      }

      const openTotal = openOrders.reduce((sum, o) => sum + Number(o.total), 0);
      const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);

      // O total pago pode incluir os 10% de serviço (calculado só na tela, não persistido
      // em nenhum pedido), então aqui só garantimos que não ficou menor que os pedidos em aberto.
      if (paidTotal < openTotal - 0.01) {
        return {
          erro: `Soma das formas de pagamento (${paidTotal.toFixed(2)}) é menor que o total em aberto (${openTotal.toFixed(2)})`,
        } as const;
      }

      const { count } = await tx.order.updateMany({
        where: { id: { in: openOrders.map((o) => o.id) }, paymentStatus: "UNPAID" },
        data: { paymentStatus: "PAID" },
      });
      // Alguém quitou algum deles no meio: aborta tudo, sem gravar Payment.
      if (count !== openOrders.length) {
        throw new ContaMudouError();
      }

      await tx.payment.createMany({
        data: payments.map((p) => ({ tenantId, tableId: id, method: p.method, amount: p.amount })),
      });
      return { count } as const;
    }).catch((erro) => {
      if (erro instanceof ContaMudouError) return { conflito: true } as const;
      throw erro;
    });

    if ("conflito" in resultado) {
      return NextResponse.json(
        { error: "A conta da mesa mudou enquanto era fechada. Atualize e tente de novo." },
        { status: 409 }
      );
    }
    if ("erro" in resultado) {
      return NextResponse.json({ error: resultado.erro }, { status: 400 });
    }
    const { count } = resultado;

    return NextResponse.json({ ok: true, count });
  });
}
