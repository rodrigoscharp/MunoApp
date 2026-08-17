import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidateTag } from "next/cache";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { DEFAULT } from "@/lib/restaurant";

const KEY = "restaurant_info";

export async function GET(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const setting = await prisma.setting.findUnique({ where: { tenantId_key: { tenantId, key: KEY } } });
    return NextResponse.json(setting ? { ...DEFAULT, ...JSON.parse(setting.value) } : DEFAULT);
  });
}

export async function PUT(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();

    await prisma.setting.upsert({
      where: { tenantId_key: { tenantId, key: KEY } },
      update: { value: JSON.stringify(body) },
      create: { tenantId, key: KEY, value: JSON.stringify(body) },
    });

    revalidateTag("restaurant_info", "max");

    return NextResponse.json({ ok: true });
  });
}
