import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { deliveryZoneCreateSchema } from "@/lib/delivery-zone";

export async function GET(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const zones = await prisma.deliveryZone.findMany({
      where: { active: true },
      orderBy: { position: "asc" },
    });
    return NextResponse.json(zones);
  });
}

export async function POST(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (session?.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const parsed = deliveryZoneCreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }
    const { name, price } = parsed.data;

    const last = await prisma.deliveryZone.findFirst({ orderBy: { position: "desc" } });
    // tenantId sai do header injetado pelo proxy, nunca do corpo: o schema já
    // descarta o campo, e aqui ele é escrito por último de propósito.
    const zone = await prisma.deliveryZone.create({
      data: { tenantId, name, price, position: (last?.position ?? 0) + 1 },
    });

    return NextResponse.json(zone, { status: 201 });
  });
}
