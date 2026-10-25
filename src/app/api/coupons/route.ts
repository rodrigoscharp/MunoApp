import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { couponSchema, normalizeCouponCode } from "@/lib/coupon";
import { invalidarCupomEmDestaque } from "@/lib/loja/vitrine";

/**
 * Lista os cupons do restaurante. Só admin: a resposta é a lista de códigos
 * válidos, exatamente o que alguém raspa e sai usando se ficar aberta.
 */
export async function GET(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (session?.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { orders: true } } },
    });
    return NextResponse.json(coupons);
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

    const parsed = couponSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { code, ...rest } = parsed.data;

    try {
      const coupon = await prisma.coupon.create({
        data: { ...rest, code: normalizeCouponCode(code), tenantId },
      });
      // Um destaque por restaurante: o card da loja mostra um cupom só, então
      // marcar este desmarca os outros. Depois de criar, e não antes: um
      // código repetido (P2002) já tinha apagado o destaque que estava no ar,
      // e o card sumia da loja por causa de um cupom que nem nasceu. Entre as
      // duas escritas há dois marcados por um instante, e a loja mostra um
      // deles; é melhor que nenhum.
      if (rest.destaque) {
        await prisma.coupon.updateMany({
          where: { destaque: true, id: { not: coupon.id } },
          data: { destaque: false },
        });
      }
      invalidarCupomEmDestaque(tenantId);
      return NextResponse.json({ ...coupon, _count: { orders: 0 } }, { status: 201 });
    } catch (err) {
      // Colisão do @@unique([tenantId, code]). Sem este catch viraria 500 pelo
      // withErrorHandling e o admin não saberia que o código já existe.
      if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
        return NextResponse.json(
          { error: [{ message: "Já existe um cupom com esse código" }] },
          { status: 409 }
        );
      }
      throw err;
    }
  });
}
