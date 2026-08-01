import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";

// Só dinheiro. slug, status e nome ficam de fora de propósito: esta rota não
// pode virar uma porta lateral para mudar a identidade de um cliente.
const schema = z.object({
  valorMensal: z.number().min(0).nullable().optional(),
  diaVencimento: z.number().int().min(1).max(28).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await authPlatform();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const existe = await prismaUnscoped.tenant.findUnique({ where: { id } });
  if (!existe) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  const tenant = await prismaUnscoped.tenant.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json(tenant);
}
