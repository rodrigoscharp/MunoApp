import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";

const schema = z.object({ texto: z.string().min(1) });

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

  const nota = await prismaUnscoped.leadNote.create({
    data: { leadId: id, texto: parsed.data.texto },
  });

  // Toca o updatedAt do lead para ele subir no funil, que ordena por atividade.
  await prismaUnscoped.lead.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(nota, { status: 201 });
}
