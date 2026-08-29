import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const categories = await prisma.category.findMany({
      orderBy: { position: "asc" },
    });
    return NextResponse.json(categories);
  });
}

const schema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  position: z.number().int().default(0),
});

export async function POST(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (session?.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    try {
      const category = await prisma.category.create({ data: { ...parsed.data, tenantId } });
      return NextResponse.json(category, { status: 201 });
    } catch (err) {
      // Colisão do @@unique([tenantId, slug]) — mesmo tratamento de /api/coupons
      // e /api/tables. 500 aqui deixaria o admin sem saber que o slug já existe.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json(
          { error: "Já existe uma categoria com esse slug" },
          { status: 409 }
        );
      }
      throw err;
    }
  });
}
