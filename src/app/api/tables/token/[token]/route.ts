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
      select: { id: true, number: true, name: true, token: true },
    });

    if (!table) {
      return NextResponse.json({ error: "Mesa não encontrada" }, { status: 404 });
    }

    return NextResponse.json(table);
  });
}
