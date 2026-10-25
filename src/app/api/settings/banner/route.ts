import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { bannerSchema, CHAVE_DO_BANNER, tagDoBanner } from "@/lib/loja/banner";

/**
 * Grava a escolha do banner do cardápio: mais vendido (o padrão) ou um item
 * escolhido pelo dono, com a chamada opcional. Ver src/lib/loja/banner.ts.
 */
export async function PUT(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const parsed = bannerSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }
    const config = parsed.data;

    if (config.modo === "item") {
      if (!config.itemId) {
        return NextResponse.json({ error: [{ message: "Escolha o item do banner" }] }, { status: 400 });
      }
      // O prisma escopado só encontra item deste restaurante: um id de outro
      // não passa, e o banner nunca aponta para o cardápio alheio.
      const item = await prisma.menuItem.findUnique({
        where: { id: config.itemId },
        select: { id: true, available: true },
      });
      if (!item) {
        return NextResponse.json({ error: [{ message: "Item não encontrado" }] }, { status: 404 });
      }
      // O painel só oferece itens disponíveis, e o banner nunca mostra um
      // esgotado: gravar um seria salvar uma escolha que não aparece.
      if (!item.available) {
        return NextResponse.json(
          { error: [{ message: "Este item está indisponível. Escolha outro ou deixe no automático." }] },
          { status: 409 }
        );
      }
    }

    // No modo automático o item e a chamada não valem; gravar limpo evita que
    // uma escolha antiga reapareça sozinha numa troca de modo.
    const valor = JSON.stringify(
      config.modo === "item" ? config : { modo: "mais-vendido", itemId: null, chamada: "" }
    );
    await prisma.setting.upsert({
      where: { tenantId_key: { tenantId, key: CHAVE_DO_BANNER } },
      update: { value: valor },
      create: { tenantId, key: CHAVE_DO_BANNER, value: valor },
    });

    revalidateTag(tagDoBanner(tenantId), { expire: 0 });
    return NextResponse.json({ ok: true });
  });
}
