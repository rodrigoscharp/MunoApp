import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import bcrypt from "bcryptjs";

// Confere que o alvo existe E é motoboy, dentro do tenant corrente (o where do
// prisma escopado já leva o tenantId). Usa findFirst porque `update`/`delete`
// exigem um where único e não aceitam o papel junto.
async function ehMotoboyDoTenant(id: string): Promise<boolean> {
  const alvo = await prisma.user.findFirst({
    where: { id, role: "MOTOBOY" },
    select: { id: true },
  });
  return alvo !== null;
}

export async function PATCH(
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
    const { password } = await req.json() as { password?: string };

    if (!password || password.length < 6) {
      return NextResponse.json({ error: "Senha inválida" }, { status: 400 });
    }

    // O papel entra no where junto com o id. A extensão de tenant escopa a
    // linha ao restaurante, mas não ao papel: só com o id, esta rota alcançava
    // qualquer User do tenant — inclusive um CUSTOMER, e trocar a senha dele é
    // entregar a conta (histórico de pedidos, endereço, telefone) ao dono do
    // restaurante. 404, e não 403, porque "não é motoboy" e "não existe" não
    // devem ser distinguíveis daqui.
    if (!(await ehMotoboyDoTenant(id))) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.update({
      where: { id },
      data: { password: hashed },
      select: { id: true, name: true, email: true },
    });

    return NextResponse.json(user);
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

    // Mesma guarda do PATCH, e pelo mesmo motivo: sem ela esta rota apagava
    // qualquer usuário do restaurante, cliente inclusive.
    if (!(await ehMotoboyDoTenant(id))) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }

    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  });
}
