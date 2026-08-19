import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { z } from "zod";

const KEY = "printer_config";

export interface PrinterConfig {
  enabled: boolean;
  paperWidth: "58mm" | "80mm";
}

// Mesma correção das outras duas rotas de settings: o PUT gravava o corpo sem
// olhar. A largura importa além do 400: ela vira comando de impressão, e um
// valor fora da lista só se revela quando o cupom sai torto no balcão.
const printerConfigSchema = z.object({
  enabled: z.boolean(),
  paperWidth: z.enum(["58mm", "80mm"]),
});

const DEFAULT: PrinterConfig = { enabled: false, paperWidth: "80mm" };

export async function GET(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const setting = await prisma.setting.findUnique({ where: { tenantId_key: { tenantId, key: KEY } } });
    const config: PrinterConfig = setting ? { ...DEFAULT, ...JSON.parse(setting.value) } : DEFAULT;
    return NextResponse.json(config);
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

    const parsed = printerConfigSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const value = JSON.stringify(parsed.data);
    await prisma.setting.upsert({
      where: { tenantId_key: { tenantId, key: KEY } },
      update: { value },
      create: { tenantId, key: KEY, value },
    });

    return NextResponse.json({ ok: true });
  });
}
