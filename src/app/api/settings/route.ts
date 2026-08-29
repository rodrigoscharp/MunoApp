import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { z } from "zod";

const DELIVERY_TIME_KEY = "delivery_time_minutes";
const DEFAULT_MINUTES = 45;

const minutosSchema = z.object({
  minutes: z.number().int().min(5).max(180),
});

export async function GET(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const setting = await prisma.setting.findUnique({
      where: { tenantId_key: { tenantId, key: DELIVERY_TIME_KEY } },
    });

    const minutes = setting ? parseInt(setting.value, 10) : DEFAULT_MINUTES;
    return NextResponse.json({ minutes });
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

    // Era `await req.json() as { minutes: number }` — cast de TypeScript, que
    // não existe em runtime. Corpo `null` estourava ao desestruturar e virava
    // 500; fracionado passava e voltava truncado pelo parseInt do fim. Mesmo
    // conserto já aplicado em src/lib/business-hours.ts pelo mesmo motivo.
    const parsed = minutosSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Tempo inválido (5–180 min)" }, { status: 400 });
    }
    const { minutes } = parsed.data;

    const setting = await prisma.setting.upsert({
      where: { tenantId_key: { tenantId, key: DELIVERY_TIME_KEY } },
      update: { value: String(minutes) },
      create: { tenantId, key: DELIVERY_TIME_KEY, value: String(minutes) },
    });

    return NextResponse.json({ minutes: parseInt(setting.value, 10) });
  });
}
