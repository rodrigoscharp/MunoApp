import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidateTag } from "next/cache";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { DEFAULT_SCHEDULE, WeekSchedule, weekScheduleSchema } from "@/lib/business-hours";

export type { WeekSchedule };

const KEY = "business_hours";

export async function GET(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const setting = await prisma.setting.findUnique({ where: { tenantId_key: { tenantId, key: KEY } } });
    const schedule: WeekSchedule = setting ? JSON.parse(setting.value) : DEFAULT_SCHEDULE;
    return NextResponse.json(schedule);
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

    const parsed = weekScheduleSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const value = JSON.stringify(parsed.data);
    await prisma.setting.upsert({
      where: { tenantId_key: { tenantId, key: KEY } },
      update: { value },
      create: { tenantId, key: KEY, value },
    });

    revalidateTag("business_hours", "max");

    return NextResponse.json({ ok: true });
  });
}
