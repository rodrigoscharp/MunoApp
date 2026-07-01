import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const session = await auth();
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const { id } = await params;

    const orders = await prisma.order.findMany({
      where: { tableId: id, status: { not: "CANCELLED" }, paymentStatus: "UNPAID" },
      include: { items: { include: { menuItem: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(orders);
  });
}
