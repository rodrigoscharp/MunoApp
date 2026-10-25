import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { getCardapio, invalidarCardapio } from "@/lib/menu-cache";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  // Mesmo cache da vitrine: o upsell do carrinho abre em toda página do
  // cardápio, e cada abertura ia direto ao banco. Falha de banco aqui é 500
  // (withTenant), e não lista vazia: o CartUpsell já some quando a resposta não
  // é ok, e um vazio com 200 seria indistinguível de cardápio sem itens.
  return withTenant(tenantId, async () => {
    const categories = await getCardapio(tenantId);
    return NextResponse.json(categories);
  });
}

const menuItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  imageUrl: z.string().url().optional().nullable(),
  // A foto sem fundo, para o banner. null tira o recorte; ausente não mexe.
  imagemRecortadaUrl: z.string().url().optional().nullable(),
  available: z.boolean().default(true),
  categoryId: z.string(),
  // null limpa a declaração ("não informado"); ausente não mexe. String como
  // "false" é recusada de propósito: virar boolean por coerção reabriria o
  // buraco que a coluna anulável fecha.
  containsGluten: z.boolean().nullable().optional(),
  containsLactose: z.boolean().nullable().optional(),
  isVegan: z.boolean().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (session?.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
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
    // Sem isto o item novo só apareceria na vitrine quando o cache de 1h
    // vencesse. Mesmo motivo nas outras escritas de MenuItem e Category.
    invalidarCardapio(tenantId);
    return NextResponse.json(item, { status: 201 });
  });
}
