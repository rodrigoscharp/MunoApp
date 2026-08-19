import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  price: z.number().positive().optional(),
  imageUrl: z.string().url().optional().nullable(),
  available: z.boolean().optional(),
  categoryId: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const { id } = await params;
    const item = await prisma.menuItem.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!item) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(item);
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (session?.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    // A categoria é resolvida contra o banco antes de virar dado. A extensão de
    // tenant escopa a LINHA que está sendo alterada, mas não os ids que vão no
    // `data` — sem esta checagem, um categoryId de outro restaurante era aceito
    // pela foreign key (que é global) e o item sumia do cardápio, pendurado numa
    // categoria de outra casa.
    if (parsed.data.categoryId) {
      const categoria = await prisma.category.findUnique({
        where: { id: parsed.data.categoryId },
        select: { id: true },
      });
      if (!categoria) {
        return NextResponse.json({ error: "Categoria não encontrada" }, { status: 422 });
      }
    }

    try {
      const item = await prisma.menuItem.update({
        where: { id },
        data: parsed.data,
      });
      return NextResponse.json(item);
    } catch (err) {
      // P2025 = nenhuma linha casou o where. Com o escopo de tenant embutido,
      // isso é "não é seu" ou "não existe" — 404 nos dois casos, e não o 500 que
      // o handler genérico devolvia.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
      }
      throw err;
    }
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (session?.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const { id } = await params;

    try {
      await prisma.menuItem.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // P2025: não existe, ou é de outro tenant (o where já vem escopado).
        if (err.code === "P2025") {
          return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
        }
        // P2003: OrderItem aponta para este item. Apagar destruiria o histórico
        // de quem já pediu — o recibo perderia o nome do prato. O caminho certo
        // é desativar (`available: false`), que tira do cardápio e preserva os
        // pedidos. Antes daqui o admin só via "Erro interno do servidor" e não
        // tinha como adivinhar isso.
        if (err.code === "P2003") {
          return NextResponse.json(
            {
              error:
                "Este item já foi pedido e não pode ser excluído. Desative-o para tirá-lo do cardápio.",
            },
            { status: 409 }
          );
        }
      }
      throw err;
    }

    return NextResponse.json({ success: true });
  });
}
