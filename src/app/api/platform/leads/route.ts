import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";

const createSchema = z.object({
  restaurante: z.string().min(2, "Informe o nome do restaurante"),
  contato: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  telefone: z.string().optional(),
  cidade: z.string().optional(),
  endereco: z.string().optional(),
  logoUrl: z.string().optional(),
  origem: z.string().default("manual"),
});

export async function GET() {
  const session = await authPlatform();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const leads = await prismaUnscoped.lead.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(leads);
}

export async function POST(req: NextRequest) {
  const session = await authPlatform();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { restaurante, origem, ...opcionais } = parsed.data;

  // Campo opcional deixado em branco vira null, nunca string vazia: garante
  // que "não informado" tenha uma representação só no banco.
  const limpos = Object.fromEntries(
    Object.entries(opcionais).map(([k, v]) => [k, v?.trim() ? v.trim() : null])
  );

  const lead = await prismaUnscoped.lead.create({
    data: { restaurante, origem, ...limpos },
  });
  return NextResponse.json(lead, { status: 201 });
}
