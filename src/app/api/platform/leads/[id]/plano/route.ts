import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";

// Endereçada por lead, não por tenant: é aqui (e no ConverterLead, no
// fechamento) que a decisão de produto colocou a gestão de plano — junto do
// resto do funil, não em platform/clientes. Por isso não reaproveita
// api/platform/clientes/[id]/route.ts, que é "só dinheiro" de propósito.
const schema = z.object({
  plano: z.enum(["MEMBRO", "MEMBRO_MESA_QR"]),
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

  const lead = await prismaUnscoped.lead.findUnique({ where: { id } });
  if (!lead) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }
  if (!lead.tenantId) {
    return NextResponse.json(
      { error: "Este lead ainda não foi convertido em cliente." },
      { status: 409 }
    );
  }

  const tenant = await prismaUnscoped.tenant.update({
    where: { id: lead.tenantId },
    data: { plano: parsed.data.plano },
  });

  return NextResponse.json({ tenant });
}
