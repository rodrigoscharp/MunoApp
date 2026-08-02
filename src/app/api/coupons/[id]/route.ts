import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { couponSchema, normalizeCouponCode } from "@/lib/coupon";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (session?.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const parsed = couponSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { id } = await params;
    const { code, ...rest } = parsed.data;

    try {
      // O where do prisma escopado já leva tenantId, então um id de outro
      // restaurante não encontra linha nenhuma e cai no P2025 abaixo.
      const coupon = await prisma.coupon.update({
        where: { id },
        data: { ...rest, code: normalizeCouponCode(code) },
        include: { _count: { select: { orders: true } } },
      });
      return NextResponse.json(coupon);
    } catch (err) {
      const codigo = typeof err === "object" && err !== null && "code" in err ? err.code : null;
      if (codigo === "P2002") {
        return NextResponse.json(
          { error: [{ message: "Já existe um cupom com esse código" }] },
          { status: 409 }
        );
      }
      if (codigo === "P2025") {
        return NextResponse.json({ error: [{ message: "Cupom não encontrado" }] }, { status: 404 });
      }
      throw err;
    }
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (session?.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const { id } = await params;
    // Os pedidos que usaram o cupom ficam: o onDelete SetNull solta o couponId e
    // o couponCode gravado no pedido preserva o histórico e o recibo.
    await prisma.coupon.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  });
}
