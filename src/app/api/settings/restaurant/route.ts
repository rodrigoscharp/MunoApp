import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidateTag } from "next/cache";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { getRestaurantInfo } from "@/lib/restaurant";

const KEY = "restaurant_info";

export async function GET(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  // Uma fonte só para o cadastro do restaurante. Esta rota reimplementava a
  // leitura — mesmo merge, mesmo default — e por isso continuaria devolvendo o
  // fallback antigo depois de ele ter sido corrigido em um lugar só. Também
  // ganha o cache e o `JSON.parse` protegido de graça.
  return withTenant(tenantId, async () =>
    NextResponse.json(await getRestaurantInfo(tenantId))
  );
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
