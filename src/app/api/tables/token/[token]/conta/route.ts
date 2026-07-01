import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withErrorHandling(async () => {
    const { token } = await params;

    const table = await prisma.table.findFirst({
      where: { token, active: true },
      select: { id: true, number: true, name: true },
    });

    if (!table) {
      return NextResponse.json({ error: "Mesa não encontrada" }, { status: 404 });
    }

    const orders = await prisma.order.findMany({
      where: { tableId: table.id, paymentStatus: "UNPAID", status: { not: "CANCELLED" } },
      include: { items: { include: { menuItem: true } } },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ table: { number: table.number, name: table.name }, orders });
  });
}
