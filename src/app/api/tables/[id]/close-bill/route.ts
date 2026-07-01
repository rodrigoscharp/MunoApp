import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api";
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const session = await auth();
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = closeBillSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }
    const { payments } = parsed.data;

    const openOrders = await prisma.order.findMany({
      where: { tableId: id, paymentStatus: "UNPAID", status: { not: "CANCELLED" } },
      select: { total: true },
    });

    if (openOrders.length === 0) {
      return NextResponse.json({ error: "Nenhum pedido em aberto nesta mesa" }, { status: 400 });
    }

    const openTotal = openOrders.reduce((sum, o) => sum + Number(o.total), 0);
    const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);

    // O total pago pode incluir os 10% de serviço (calculado só na tela, não persistido
    // em nenhum pedido), então aqui só garantimos que não ficou menor que os pedidos em aberto.
    if (paidTotal < openTotal - 0.01) {
      return NextResponse.json(
        { error: `Soma das formas de pagamento (${paidTotal.toFixed(2)}) é menor que o total em aberto (${openTotal.toFixed(2)})` },
        { status: 400 }
      );
    }

    const [{ count }] = await prisma.$transaction([
      prisma.order.updateMany({
        where: { tableId: id, paymentStatus: "UNPAID", status: { not: "CANCELLED" } },
        data: { paymentStatus: "PAID" },
      }),
      prisma.payment.createMany({
        data: payments.map((p) => ({ tableId: id, method: p.method, amount: p.amount })),
      }),
    ]);

    return NextResponse.json({ ok: true, count });
  });
}
