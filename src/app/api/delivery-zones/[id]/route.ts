import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { deliveryZoneUpdateSchema } from "@/lib/delivery-zone";

// P2025 = nenhuma linha casou o where. Com o escopo de tenant embutido, isso é
// "não é sua" ou "não existe" — 404 nos dois casos, e não o 500 que o handler
// genérico devolvia.
function naoEncontrada(err: unknown) {
  const codigo =
    typeof err === "object" && err !== null && "code" in err ? err.code : null;
  return codigo === "P2025";
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (session?.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const parsed = deliveryZoneUpdateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { id } = await params;

    try {
      const zone = await prisma.deliveryZone.update({
        where: { id },
        data: parsed.data,
      });
      return NextResponse.json(zone);
    } catch (err) {
      if (naoEncontrada(err)) {
        return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
      }
      throw err;
    }
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = getTenantIdFromRequest(_req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (session?.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const { id } = await params;

    try {
      await prisma.deliveryZone.delete({ where: { id } });
    } catch (err) {
      if (naoEncontrada(err)) {
        return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
      }
      throw err;
    }

    return NextResponse.json({ ok: true });
  });
}
