import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import {
  competenciaDe,
  vencimentoDaCompetencia,
} from "@/lib/assinatura/competencia";
import { statusPelaRegua } from "@/lib/assinatura/regua";
import { assinaturaTemPagamentoConfirmado } from "@/lib/assinatura/asaas";
import {
  reconciliarInscricoesPagas,
  type ResultadoReconciliacao,
} from "@/lib/assinatura/reconciliacao";
import { registrarEvento } from "@/lib/funil/registrar";

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

  // Reconciliação ANTES da faxina, de propósito. Ela provisiona quem pagou e
  // ficou esperando um webhook que não chegou — e ao fazer isso tira essas
  // linhas da frente da faxina, que então nem precisa perguntar ao Asaas
  // sobre elas. Na ordem inversa seriam duas consultas para a mesma pergunta,
  // com uma janela entre as duas.
  //
  // E, como a faxina, ela não propaga: a mesma regra de sempre — conveniência
  // não derruba receita, e um Asaas fora do ar não pode fazer o job sair sem
  // gerar a fatura de ninguém.
  let reconciliacao: ResultadoReconciliacao = {
    candidatas: 0,
    provisionadas: 0,
    falhas: 0,
  };
  let reconciliacaoFalhou = false;
  try {
    reconciliacao = await reconciliarInscricoesPagas(agora);
  } catch (erro) {
    reconciliacaoFalhou = true;
    console.error(
      "[cron/assinaturas] Reconciliação falhou inteira — quem pagou e não foi provisionado continua esperando a próxima passada",
      erro
    );
  }

  // A REGRA: soltar slug abandonado é conveniência; emitir cobrança e mover a
  // régua é receita. Conveniência não derruba receita — o mesmo motivo pelo
  // qual o Lead não pode abortar um checkout já pago (src/app/api/assinar/
  // route.ts) e o e-mail de boas-vindas não pode abortar um provisionamento
  // (webhook do Asaas). Por isso esta limpeza roda por ÚLTIMO, depois que a
  // cobrança do mês e a régua já foram processadas, e por isso ela nunca
  // propaga: um blip de conexão aqui não pode fazer o job inteiro sair sem
  // gerar a fatura de ninguém. Slug preso por mais 24h é irrelevante; fatura
  // não emitida não é.
  let inscricoesExpiradas = 0;
  let limpezaDeInscricoesFalhou = false;
  try {
    const candidatas = await prismaUnscoped.inscricao.findMany({
      where: {
        status: "AGUARDANDO_PAGAMENTO",
        expiraEm: { lt: agora },
      },
      select: { id: true, slug: true, asaasSubscriptionId: true, sessaoId: true },
    });

    // Vencida NÃO é o mesmo que não paga, e a diferença custa um cliente.
    //
    // O status só vira PROVISIONADA quando o webhook chega. Entre o cliente
    // pagar e o webhook ser entregue existe uma janela — fila do Asaas
    // interrompida, deploy caindo, rede — que pode ser maior que o expiraEm
    // (1h no cartão). Apagar a linha nessa janela destrói os três campos que
    // ligam aquele pagamento a alguém (externalReference, asaasPaymentId,
    // asaasSubscriptionId): o webhook que chegar depois não casa com nada, o
    // handler responde 200, e o cliente segue sendo cobrado todo mês sem
    // restaurante e sem rastro nenhum no banco.
    //
    // Por isso perguntamos ao Asaas antes. Em dúvida — consulta que falha —
    // a inscrição fica para a próxima passada: slug preso por mais um dia é
    // irrelevante perto de dinheiro sem contrapartida.
    const paraApagar: string[] = [];
    for (const candidata of candidatas) {
      if (!candidata.asaasSubscriptionId) {
        // Morreu antes de o Asaas existir para ela: não há pagamento
        // possível, e não há o que perguntar.
        paraApagar.push(candidata.id);
        continue;
      }
      try {
        if (
          await assinaturaTemPagamentoConfirmado(candidata.asaasSubscriptionId)
        ) {
          console.error(
            `[cron/assinaturas] Inscricao ${candidata.id} (slug ${candidata.slug}) ` +
              `venceu mas TEM pagamento confirmado no Asaas — preservada. ` +
              `O provisionamento não completou: verificar o webhook.`
          );
          continue;
        }
      } catch (erro) {
        // Uma linha problemática não trava a faxina inteira, e dúvida nunca
        // vira exclusão.
        console.error(
          `[cron/assinaturas] Não foi possível confirmar pagamento da Inscricao ` +
            `${candidata.id} no Asaas — preservada por precaução`,
          erro
        );
        continue;
      }
      paraApagar.push(candidata.id);
    }

    if (paraApagar.length > 0) {
      const resultado = await prismaUnscoped.inscricao.deleteMany({
        where: { id: { in: paraApagar } },
      });
      inscricoesExpiradas = resultado.count;
    }

    // O rastro que a exclusão apagaria. A Inscricao precisa morrer para soltar
    // o slug (o @unique é o que segura o endereço), mas o fato de alguém ter
    // chegado até o pagamento e desistido é justamente o degrau onde mais gente
    // cai, e hoje ele se desfaz em silêncio.
    //
    // Em try próprio: fechar lead e registrar evento é relatório, e a mesma
    // regra do bloco inteiro vale aqui, com mais razão ainda. Slug preso por
    // mais 24h é irrelevante; fatura não emitida não é.
    for (const candidata of candidatas.filter((c) => paraApagar.includes(c.id))) {
      await registrarEvento(prismaUnscoped, {
        sessaoId: candidata.sessaoId,
        tipo: "ABANDONOU",
        detalhe: null,
      });

      if (!candidata.sessaoId) continue;

      try {
        // Só o lead daquela sessão, e só se ainda estiver em aberto. FECHADO
        // não volta atrás por causa de um relógio, e PERDIDO já está perdido.
        await prismaUnscoped.lead.updateMany({
          where: {
            sessaoId: candidata.sessaoId,
            tenantId: null,
            status: { notIn: ["FECHADO", "PERDIDO"] },
          },
          data: {
            status: "PERDIDO",
            motivoPerda: "Checkout expirado sem pagamento",
          },
        });
      } catch (erro) {
        console.error(
          `[cron/assinaturas] não foi possível fechar o lead da sessão ${candidata.sessaoId}`,
          erro
        );
      }
    }
  } catch (erro) {
    limpezaDeInscricoesFalhou = true;
    console.error(
      "[cron/assinaturas] Falha ao apagar inscrição vencida — slug fica preso até a próxima passada",
      erro
    );
  }

  const resposta = {
    competencia,
    reconciliacao,
    ...(reconciliacaoFalhou ? { reconciliacaoFalhou } : {}),
    inscricoesExpiradas,
    assinaturas: assinaturas.length,
    cobrancasCriadas,
    cobrancasJaExistentes,
    statusAtualizados,
  };

  // Contador honesto: se a limpeza falhou, inscricoesExpiradas fica 0 (nada
  // apurado, e não um "0" que finge sucesso) e o campo abaixo torna a falha
  // visível pra quem olhar a resposta do job, sem inventar uma contagem que
  // não aconteceu.
  return NextResponse.json(
    limpezaDeInscricoesFalhou
      ? { ...resposta, limpezaDeInscricoesFalhou: true }
      : resposta
  );
}

// A Vercel dispara o cron com GET. O POST fica para o disparo manual, que é
// o verbo honesto para uma chamada que escreve.
export async function GET(req: NextRequest) {
  return executar(req);
}

export async function POST(req: NextRequest) {
  return executar(req);
}
