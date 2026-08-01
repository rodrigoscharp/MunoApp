import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import { ProvisionError, provisionTenant } from "@/lib/tenant-provisioning";

const schema = z.object({
  slug: z.string().min(1),
  email: z.string().email(),
  nome: z.string().min(2).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await authPlatform();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const lead = await prismaUnscoped.lead.findUnique({ where: { id } });
  if (!lead) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }
  if (lead.tenantId) {
    return NextResponse.json(
      { error: "Este lead já foi convertido em cliente." },
      { status: 409 }
    );
  }

  try {
    const { tenant, admin, url, senha } = await provisionTenant({
      nome: parsed.data.nome ?? lead.restaurante,
      slug: parsed.data.slug,
      email: parsed.data.email,
    });

    await prismaUnscoped.lead.update({
      where: { id },
      data: { tenantId: tenant.id, status: "FECHADO" },
    });

    // Senha devolvida uma única vez: não fica recuperável depois.
    return NextResponse.json({ tenant, url, email: admin.email, senha }, { status: 201 });
  } catch (err) {
    if (err instanceof ProvisionError) {
      const status = err.code === "SLUG_EM_USO" ? 409 : 400;
      return NextResponse.json({ error: err.message }, { status });
    }
    throw err;
  }
}
