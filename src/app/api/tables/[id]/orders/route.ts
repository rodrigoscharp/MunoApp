import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getPlanoFromRequest, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { tenantTemMesaQr } from "@/lib/plans";

export async function GET(
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

    const orders = await prisma.order.findMany({
      where: { tableId: id, status: { not: "CANCELLED" }, paymentStatus: "UNPAID" },
      include: { items: { include: { menuItem: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(orders);
  });
}
