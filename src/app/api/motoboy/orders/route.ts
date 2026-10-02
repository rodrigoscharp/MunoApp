import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";

// GET /api/motoboy/orders — lista pedidos READY com entrega disponíveis
export async function GET(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (!session?.user || (session.user.role !== "MOTOBOY" && session.user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const orders = await prisma.order.findMany({
      where: {
        status: "READY",
        deliveryType: "DELIVERY",
        motoboyId: null,
      },
      include: {
        items: { include: { menuItem: { select: { name: true } } } },
      },
      orderBy: { createdAt: "asc" },
      // Pedidos prontos esperando motoboy: nunca são muitos ao mesmo tempo, e
      // o teto impede que um acúmulo vire resposta gigante a cada polling.
      take: 50,
    });

    return NextResponse.json(orders);
  });
}
