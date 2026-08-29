import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getPlanoFromRequest, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { tenantTemMesaQr } from "@/lib/plans";
import { z } from "zod";

const createSchema = z.object({
  number: z.number().int().positive(),
  name: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);
  if (!tenantTemMesaQr(getPlanoFromRequest(req))) {
    return apiError("Recurso não disponível neste plano", 403);
  }

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const tables = await prisma.table.findMany({
      orderBy: { number: "asc" },
      include: {
        orders: {
          where: { status: { not: "CANCELLED" }, paymentStatus: "UNPAID" },
          select: { total: true },
        },
      },
    });

    const result = tables.map(({ orders, ...table }) => ({
      ...table,
      openOrdersCount: orders.length,
      openTotal: orders.reduce((sum, o) => sum + Number(o.total), 0),
    }));

    return NextResponse.json(result);
  });
}

export async function POST(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);
  if (!tenantTemMesaQr(getPlanoFromRequest(req))) {
    return apiError("Recurso não disponível neste plano", 403);
  }

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    try {
      const table = await prisma.table.create({
        data: {
          tenantId,
          number: parsed.data.number,
          name: parsed.data.name,
        },
      });

      return NextResponse.json(table, { status: 201 });
    } catch (err) {
      // Colisão do @@unique([tenantId, number]). Sem este catch viraria 500 pelo
      // withErrorHandling, e o admin não teria como saber que o número já existe
      // — mesma correção já feita em /api/coupons.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json(
          { error: "Já existe uma mesa com esse número" },
          { status: 409 }
        );
      }
      throw err;
    }
  });
}
