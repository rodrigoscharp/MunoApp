import { NextRequest, NextResponse } from "next/server";
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
      include: {
        items: {
          where: { available: true },
          orderBy: { name: "asc" },
        },
      },
    });
    return NextResponse.json(categories);
  });
}

const menuItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  imageUrl: z.string().url().optional().nullable(),
  available: z.boolean().default(true),
  categoryId: z.string(),
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
    const parsed = menuItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    // Mesma razão do PUT em [id]/route.ts: a extensão de tenant escopa a linha
    // criada, não o categoryId que vem no corpo. A foreign key é global e
    // aceitaria a categoria de outro restaurante sem reclamar.
    const categoria = await prisma.category.findUnique({
      where: { id: parsed.data.categoryId },
      select: { id: true },
    });
    if (!categoria) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 422 });
    }

    const item = await prisma.menuItem.create({ data: { ...parsed.data, tenantId } });
    return NextResponse.json(item, { status: 201 });
  });
}
