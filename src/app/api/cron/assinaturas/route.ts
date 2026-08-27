import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import {
  competenciaDe,
  vencimentoDaCompetencia,
} from "@/lib/assinatura/competencia";
import { statusPelaRegua } from "@/lib/assinatura/regua";

/**
 * Job diário da assinatura. Duas responsabilidades, nesta ordem: gerar a
 * cobrança do mês e mover o status pela régua.
 *
 * Nenhuma das duas depende de ter rodado ontem — se um dia falhar, o dia
 * seguinte corrige tudo. Job de cobrança que acumula estado é job que erra
 * depois de um incidente, justamente quando ninguém está olhando.
 *
 * É trabalho de plataforma, sem tenant no contexto: tudo por prismaUnscoped.
 */
async function executar(req: NextRequest) {
  // `segredo &&` não é redundante: sem ele, um ambiente onde a variável não
  // foi configurada compararia o header com a string "Bearer undefined" e
  // abriria o job para quem mandasse exatamente isso.
  const segredo = process.env.CRON_SECRET;
  const autorizado =
    !!segredo && req.headers.get("authorization") === `Bearer ${segredo}`;
  if (!autorizado) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const agora = new Date();
  const competencia = competenciaDe(agora);

  // Slug abandonado não fica preso para sempre. Apagar, e não marcar como
  // expirada: enquanto a linha existir o slug @unique continua segurando o
  // nome, que é o que esta limpeza existe para soltar. O Lead criado no
  // checkout preserva o registro de quem tentou e não concluiu.
  const { count: inscricoesExpiradas } =
    await prismaUnscoped.inscricao.deleteMany({
      where: {
        status: "AGUARDANDO_PAGAMENTO",
        expiraEm: { lt: agora },
      },
    });

  const assinaturas = await prismaUnscoped.assinatura.findMany({
    where: { status: { not: "CANCELADA" } },
    select: {
      id: true,
      status: true,
      valorMensal: true,
      diaVencimento: true,
      inicioCobranca: true,
      asaasSubscriptionId: true,
    },
  });

  let cobrancasCriadas = 0;
  let cobrancasJaExistentes = 0;

  for (const assinatura of assinaturas) {
    // Redundante com o where acima, e de propósito: "cancelada não é tocada"
    // é regra do negócio, não detalhe de uma cláusula que alguém pode afrouxar
    // um dia para "ver todas as assinaturas na resposta".
    if (assinatura.status === "CANCELADA") continue;

    // Cortesia: a assinatura existe, aparece nas telas e não cobra. O primeiro
    // vencimento é negociado caso a caso, e cobrar dentro dele é exatamente a
    // falha que esta linha evita.
    if (assinatura.inicioCobranca > agora) continue;

    // Quem o Asaas cobra, o Asaas gera. O webhook espelha cada cobrança dele
    // numa Cobranca local — gerar aqui também criaria a mesma dívida duas
    // vezes, e a segunda nunca receberia baixa, porque o pagamento no gateway
    // não sabe que essa segunda linha existe.
    //
    // A régua do segundo laço continua rodando para esta assinatura, de
    // propósito: cartão que falha vira cobrança vencida pelo webhook, e o
    // bloqueio precisa acontecer pelo caminho de sempre. Se este `continue`
    // um dia pular o recálculo de status também, um cliente de gateway
    // inadimplente nunca é bloqueado.
    if (assinatura.asaasSubscriptionId) continue;

    try {
      await prismaUnscoped.cobranca.create({
        data: {
          assinaturaId: assinatura.id,
          competencia,
          valor: assinatura.valorMensal,
          vencimento: vencimentoDaCompetencia(
            competencia,
            assinatura.diaVencimento
          ),
        },
      });
      cobrancasCriadas++;
    } catch (erro) {
      // P2002 = unique violada. Outro passe do job já criou esta competência;
      // é o desfecho esperado, não erro. A garantia é do banco justamente
      // porque "consultar e depois inserir" não protege de dois passes
      // simultâneos: os dois passariam pela consulta.
      if (
        !(erro instanceof Prisma.PrismaClientKnownRequestError) ||
        erro.code !== "P2002"
      ) {
        throw erro;
      }
      cobrancasJaExistentes++;
    }
  }

  // Uma consulta só para todas as assinaturas, e não uma por assinatura: o job
  // roda com o banco de produção inteiro à frente e não há motivo para N+1.
  // Ordenado por vencimento, o primeiro de cada assinatura é o mais antigo.
  const emAberto = await prismaUnscoped.cobranca.findMany({
    where: {
      assinaturaId: { in: assinaturas.map((a) => a.id) },
      status: { in: ["PENDENTE", "VENCIDA"] },
    },
    select: { assinaturaId: true, vencimento: true },
    orderBy: { vencimento: "asc" },
  });

  const maisAntigo = new Map<string, Date>();
  for (const cobranca of emAberto) {
    if (!maisAntigo.has(cobranca.assinaturaId)) {
      maisAntigo.set(cobranca.assinaturaId, cobranca.vencimento);
    }
  }

  let statusAtualizados = 0;

  for (const assinatura of assinaturas) {
    // Cancelamento é decisão humana; um job não desfaz decisão humana.
    if (assinatura.status === "CANCELADA") continue;

    const novoStatus = statusPelaRegua(
      maisAntigo.get(assinatura.id) ?? null,
      agora
    );
    // Sem cobrança em aberto a régua devolve ATIVA, então quem pagou volta
    // sozinho — dar baixa numa fatura não pode virar trabalho manual.
    if (novoStatus === assinatura.status) continue;

    await prismaUnscoped.assinatura.update({
      where: { id: assinatura.id },
      data: { status: novoStatus },
    });
    statusAtualizados++;
  }

  return NextResponse.json({
    competencia,
    inscricoesExpiradas,
    assinaturas: assinaturas.length,
    cobrancasCriadas,
    cobrancasJaExistentes,
    statusAtualizados,
  });
}

// A Vercel dispara o cron com GET. O POST fica para o disparo manual, que é
// o verbo honesto para uma chamada que escreve.
export async function GET(req: NextRequest) {
  return executar(req);
}

export async function POST(req: NextRequest) {
  return executar(req);
}
