import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { ONBOARDING_DISPENSADO } from "@/lib/onboarding";

/**
 * O "deixar para depois" do onboarding.
 *
 * É a única coisa do onboarding que precisa ser lembrada: se ele terminou se
 * descobre olhando os dados (ver src/lib/onboarding.ts). Guardar só a dispensa
 * é o que permite a feature inteira não ter migração nenhuma, porque cabe no
 * model Setting, que já é o par chave-valor por tenant.
 *
 * Escreve configuração do restaurante, então exige ADMIN. Sem isso um CUSTOMER
 * logado desligaria o onboarding do dono, e virar CUSTOMER é coisa que
 * qualquer visitante faz pelo "Cadastre-se grátis" da tela de login.
 */
export async function POST(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    await prisma.setting.upsert({
      where: { tenantId_key: { tenantId, key: ONBOARDING_DISPENSADO } },
      update: { value: "1" },
      create: { tenantId, key: ONBOARDING_DISPENSADO, value: "1" },
    });

    return NextResponse.json({ ok: true });
  });
}
