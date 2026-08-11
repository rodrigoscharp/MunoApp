import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import {
  DIA_VENCIMENTO_MAX,
  DIA_VENCIMENTO_PADRAO,
} from "@/lib/assinatura/competencia";
import { inicioDaCobranca } from "@/lib/assinatura/inicio";

// Só dinheiro. slug, status e nome ficam de fora de propósito: esta rota não
// pode virar uma porta lateral para mudar a identidade de um cliente.
const schema = z.object({
  // Teto casa com o DECIMAL(10,2) da coluna: sem ele o Postgres estoura e o
  // erro chega como 500 em vez de um 400 explicando o que está errado.
  valorMensal: z.number().min(0).max(99999999.99).nullable().optional(),
  diaVencimento: z
    .number()
    .int()
    .min(1)
    .max(DIA_VENCIMENTO_MAX)
    .nullable()
    .optional(),
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

  const { valorMensal, diaVencimento } = parsed.data;
  const assinatura = await prismaUnscoped.assinatura.findUnique({
    where: { tenantId: id },
  });

  // Mensalidade apagada na tela é "este cliente não paga mais", e isso é
  // cancelar, não apagar: a assinatura carrega o histórico de cobrança da
  // plataforma, e um DELETE esbarraria na foreign key da primeira fatura.
  if (valorMensal === null) {
    if (!assinatura) return NextResponse.json({ assinatura: null });
    return NextResponse.json(
      await prismaUnscoped.assinatura.update({
        where: { tenantId: id },
        data: { status: "CANCELADA" },
      })
    );
  }

  if (!assinatura) {
    if (valorMensal === undefined) {
      return NextResponse.json(
        { error: "Defina a mensalidade antes do dia de vencimento." },
        { status: 400 }
      );
    }
    const dia = diaVencimento ?? DIA_VENCIMENTO_PADRAO;
    return NextResponse.json(
      await prismaUnscoped.assinatura.create({
        data: {
          tenantId: id,
          valorMensal,
          diaVencimento: dia,
          // Terceiro caminho que cria assinatura, e o último a receber esta
          // correção. Usar a competência corrente devolvia o dia contratado
          // deste mês, que já pode ter passado: o cliente nascia vencido e o
          // job diário o bloquearia em duas semanas por uma fatura que nunca
          // foi enviada. Os outros dois caminhos (o backfill da migração e a
          // conversão de lead) já usam inicioDaCobranca pelo mesmo motivo.
          inicioCobranca: inicioDaCobranca(new Date(), 0, dia),
        },
      })
    );
  }

  return NextResponse.json(
    await prismaUnscoped.assinatura.update({
      where: { tenantId: id },
      data: {
        ...(valorMensal !== undefined ? { valorMensal } : {}),
        // dia nulo é "não mexi neste campo", não "apague o vencimento": a
        // coluna é obrigatória e a assinatura já tem um dia gravado.
        ...(diaVencimento != null ? { diaVencimento } : {}),
        // Gravar um valor de novo é o gesto de recontratar. Só reativa quem
        // estava cancelado: INADIMPLENTE e BLOQUEADA são da régua, e voltar
        // para ATIVA aqui apagaria um atraso que ninguém pagou.
        // Reativar exige recomeçar o relógio junto. Uma assinatura cancelada
        // meses atrás carrega um inicioCobranca no passado, e voltar para
        // ATIVA sem mexer nele faria o job cobrar o mês corrente com
        // vencimento já vencido — recontratado hoje, inadimplente amanhã.
        ...(assinatura.status === "CANCELADA"
          ? {
              status: "ATIVA" as const,
              inicioCobranca: inicioDaCobranca(
                new Date(),
                0,
                diaVencimento ?? assinatura.diaVencimento
              ),
            }
          : {}),
      },
    })
  );
}
