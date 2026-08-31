import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import { podeMoverAMao } from "@/lib/funil/estagio";

// tenantId NÃO está aqui de propósito: esse campo é escrito só pela rota de
// conversão, que é o único caminho que provisiona um cliente de verdade.
const updateSchema = z.object({
  status: z
    .enum(["NOVO", "CONTATADO", "NEGOCIACAO", "FECHADO", "PERDIDO"])
    .optional(),
  restaurante: z.string().min(2).optional(),
  contato: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  telefone: z.string().optional(),
  cidade: z.string().optional(),
  motivoPerda: z.string().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await authPlatform();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const lead = await prismaUnscoped.lead.findUnique({
    where: { id },
    include: {
      notas: { orderBy: { createdAt: "asc" } },
      tenant: true,
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }
  return NextResponse.json(lead);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await authPlatform();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const existing = await prismaUnscoped.lead.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }

  const { status, restaurante, ...opcionais } = parsed.data;

  // A trava fica no servidor, e não só na tela — mas só quando o PATCH tenta
  // mudar o status. O lead de checkout é justamente o que tem e-mail e não
  // tem telefone: se a guarda barrasse o corpo inteiro, um PATCH só com
  // telefone/cidade/endereco (o operador que conseguiu o número no
  // WhatsApp) seria recusado com uma mensagem que só fala de estágio.
  if (status !== undefined && !podeMoverAMao(existing)) {
    return NextResponse.json(
      {
        error:
          "Este lead veio do checkout e o estágio dele é derivado do que aconteceu. Não dá para movê-lo à mão.",
      },
      { status: 409 }
    );
  }

  // Campo opcional em branco vira null, nunca string vazia — mesma convenção
  // usada na criação do lead. Só entram no update os campos que vieram no
  // corpo da requisição: isto é um PATCH parcial, e não podemos apagar um
  // campo que o cliente nem tentou mudar.
  const limpos = Object.fromEntries(
    Object.entries(opcionais).map(([k, v]) => [k, v?.trim() ? v.trim() : null])
  );

  const lead = await prismaUnscoped.lead.update({
    where: { id },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(restaurante !== undefined ? { restaurante } : {}),
      ...limpos,
    },
  });

  return NextResponse.json(lead);
}
