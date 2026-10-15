import { NextRequest, NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { webhookAutorizado } from "@/lib/assinatura/asaas";
import { provisionarInscricao } from "@/lib/assinatura/provisionamento";
import { registrarEvento } from "@/lib/funil/registrar";
import { espelharEventoDeAssinatura } from "@/lib/assinatura/espelho";
import { reportarErro } from "@/lib/observabilidade";
import { registrarSaude } from "@/lib/saude/registrar";

/**
 * Webhook chamado pelo Asaas quando um pagamento da PLATAFORMA (a Muno
 * cobrando o restaurante pela assinatura, não o restaurante cobrando o
 * cliente dele) muda de status. É este handler que transforma um pagamento
 * confirmado em restaurante provisionado.
 *
 * Roda sozinho, sem ninguém olhando, e o Asaas reentrega a mesma chamada
 * enquanto não receber 200 — para sempre. Três consequências que moldam o
 * arquivo inteiro:
 *
 * 1. Responder sempre 200, exceto token inválido, para os ramos de
 *    ROTEAMENTO: evento que não é nosso, pagamento que não casa com
 *    nenhuma Inscricao, Inscricao já provisionada. Um 404 ou 500 nesses
 *    casos vira reentrega infinita de um evento que nunca vai mudar de
 *    resultado.
 * 2. Falha genuína de processamento (banco caiu no meio, etc.) DEVE
 *    propagar sem virar 200 — é o oposto do item 1. É a reentrega do Asaas
 *    que dá a segunda chance de terminar o trabalho, e só faz sentido se a
 *    reentrega puder ter sucesso (ver o item 3).
 * 3. Por isso cada coisa que passa a existir no mundo tem seu vínculo
 *    gravado antes do passo seguinte: uma entrega que morre no meio precisa
 *    deixar rastro suficiente para a próxima retomar de onde parou, em vez
 *    de recomeçar do zero e bater num estado que ela mesma criou (tenant
 *    com o slug já usado, assinatura com o asaasSubscriptionId já usado).
 *    Quando o próprio registro do vínculo é o passo que falha (o tenant
 *    nasceu, mas o `inscricao.update` que grava o tenantId não chegou a
 *    rodar), a retomada recupera o tenant pelo slug — ver o comentário no
 *    `catch` de SLUG_EM_USO abaixo para o porquê disso ser seguro.
 *
 * O e-mail de boas-vindas (enviarBoasVindas) sai depois da transação, em
 * try/catch que não propaga — ver o comentário logo antes da chamada, no
 * fim do handler.
 */

// Cobrança e cancelamento de assinatura que JÁ existe (renovação, atraso,
// SUBSCRIPTION_DELETED) são espelhados por espelharEventoDeAssinatura, antes
// de qualquer coisa. O que sobra aqui sabe fazer uma coisa só: nascer um
// restaurante a partir do primeiro pagamento confirmado.
const PAGOS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);

// Tentativa de pagamento que não passou: cartão recusado na captura, ou
// cobrança reprovada pela análise de risco do Asaas. Sem este ramo os dois
// caíam no "evento que este handler não sabe tratar" e sumiam, e o funil não
// distinguia quem desistiu na página de pagamento de quem tentou pagar e não
// conseguiu — a segunda pessoa quer comprar, e um telefonema resolve.
const RECUSADOS = new Set([
  "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
  "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
]);

/** Valor que nenhum id real assume — placeholder do OR abaixo. */
const SENTINELA = "__nenhum__";

/** Sempre 200: o Asaas reentrega enquanto não receber, para sempre. */
const ok = () => NextResponse.json({ ok: true });

export async function POST(req: NextRequest) {
  if (!webhookAutorizado(req.headers.get("asaas-access-token"))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const corpo = (await req.json().catch(() => null)) as {
    event?: string;
    payment?: {
      id?: string;
      value?: number;
      subscription?: string;
      externalReference?: string;
      dueDate?: string;
    };
    subscription?: { id?: string };
  } | null;

  const evento = corpo?.event;
  if (!corpo || !evento) return ok();

  // Renovação, atraso e cancelamento de assinatura existente. Antes do resto
  // porque o cron não gera Cobranca para assinatura do gateway: sem este
  // espelho, quem para de pagar no mês 2 nunca vira INADIMPLENTE. Falha aqui
  // propaga (500) e o Asaas reentrega, que é o desejado.
  if (await espelharEventoDeAssinatura(corpo, new Date())) {
    await registrarSaude({ origem: "webhook/asaas", nivel: "OK", mensagem: `${evento} espelhado` });
    return ok();
  }

  const pagamento = corpo.payment;
  if (!pagamento) return ok();

  if (RECUSADOS.has(evento)) {
    await registrarRecusa(evento, pagamento);
    return ok();
  }

  // Evento que este handler não sabe tratar: 200 e sai, para não virar
  // reentrega infinita de algo que nunca vai mudar de resultado.
  if (!PAGOS.has(evento)) return ok();

  // A busca tem três campos em OR, e a ORDEM importa:
  //
  // 1. id: pagamento.externalReference — a rede de segurança. A rota de
  //    checkout (/api/assinar) grava nele o id da própria Inscricao, então
  //    mesmo que os ids do Asaas não tenham chegado a ser gravados
  //    localmente (uma falha entre criar a assinatura no Asaas e gravar o
  //    id de volta na Inscricao), o webhook ainda acha o registro certo.
  //    Isto não é redundância com os dois campos abaixo — é o que impede
  //    "cliente pagou e ninguém sabe". Não simplifique para um campo só.
  // 2. asaasPaymentId — casa pelo id do pagamento específico.
  // 3. asaasSubscriptionId — casa pelo id da assinatura, para o caso de o
  //    evento não trazer (ou não ter sido gravado) o id do pagamento.
  //
  // O `?? SENTINELA` em cada campo evita `{ asaasPaymentId: undefined }` no
  // OR: um valor undefined pode casar de forma indesejada no Prisma, e um
  // valor sentinela impossível ("__nenhum__") não casa com nada de verdade.
  const inscricao = await acharInscricao(pagamento);

  // Pagamento que não é de uma inscrição nossa. 200, e não 404: um 404 faria
  // o Asaas reentregar para sempre um evento que nunca vai casar.
  //
  // Mas 200 em silêncio, não: um pagamento CONFIRMADO sem inscrição
  // correspondente é ou evento de outra integração da mesma conta, ou —
  // pior — um cliente que pagou e cujo registro sumiu. A busca acima olha
  // externalReference, asaasPaymentId e asaasSubscriptionId, e os três moram
  // na linha da Inscricao: se ela foi apagada, nada mais liga aquele dinheiro
  // a alguém. Este log é a única evidência que resta, e o que separa
  // descobrir em minutos de descobrir quando o cliente reclamar.
  if (!inscricao) {
    console.error(
      `[webhook/asaas] ${evento} sem Inscricao correspondente — ` +
        `payment=${pagamento.id} subscription=${pagamento.subscription} ` +
        `externalReference=${pagamento.externalReference} valor=${pagamento.value}`
    );
    // Dinheiro que entrou e não achou dono: é o alerta mais importante deste
    // arquivo, e o log sozinho não acorda ninguém.
    await reportarErro({
      origem: "webhook/asaas:pagamento-sem-inscricao",
      erro: `${evento} sem Inscricao correspondente`,
      extra: {
        paymentId: pagamento.id,
        subscriptionId: pagamento.subscription,
        externalReference: pagamento.externalReference,
        valor: pagamento.value,
      },
    });
    return ok();
  }

  // Idempotência. O Asaas reentrega quando não recebe 200 — sem esta linha,
  // a segunda entrega cria um segundo restaurante para quem pagou uma vez.
  //
  // O sinal de saúde sai também aqui: depois de uma falha recuperada, são as
  // reentregas que chegam, e sem ele a peça do webhook ficaria vermelha até o
  // próximo pagamento novo.
  if (inscricao.status === "PROVISIONADA") {
    await registrarSaude({
      origem: "webhook/asaas",
      nivel: "OK",
      mensagem: `${evento} já provisionada`,
      extra: { inscricaoId: inscricao.id },
    });
    return ok();
  }

  // O pagamento confirmado, no momento em que ele é conhecido. Fora da
  // transação de provisionamento de propósito: se o provisionamento falhar e o
  // Asaas reentregar, este evento já registrou que o dinheiro entrou, que é
  // exatamente o que você quer enxergar quando o restaurante não nasceu.
  //
  // A guarda de idempotência acima só evita duplicata DEPOIS que o
  // provisionamento completa (ela olha inscricao.status === "PROVISIONADA").
  // Enquanto ele não completar, cada reentrega do Asaas passa por aqui de
  // novo e gera outro PAGOU — ruído aceitável perto do risco oposto, que é
  // ficar sem nenhum registro de que o dinheiro entrou.
  await registrarEvento(prismaUnscoped, {
    sessaoId: inscricao.sessaoId,
    tipo: "PAGOU",
    detalhe: inscricao.plano,
  });

  // Junto do PAGOU, a Inscricao vira PAGA: é o estado de quem pagou e ainda
  // não tem restaurante, e é ele que a peça "Provisionamento" da tela de saúde
  // conta. Fora da transação pelo mesmo motivo do PAGOU: precisa sobreviver a
  // um provisionamento que falhe. A guarda de status impede que uma entrega
  // atrasada rebaixe uma inscrição que outro caminho já provisionou.
  await prismaUnscoped.inscricao.updateMany({
    where: { id: inscricao.id, status: "AGUARDANDO_PAGAMENTO" },
    data: { status: "PAGA" },
  });

  await provisionarInscricao(inscricao, {
    valorPago: pagamento.value,
    origem: "webhook/asaas",
    pagamentoId: pagamento.id,
    assinaturaGatewayId: pagamento.subscription,
  });

  await registrarSaude({
    origem: "webhook/asaas",
    nivel: "OK",
    mensagem: `${evento} processado`,
    extra: { inscricaoId: inscricao.id },
  });

  return ok();
}

type PagamentoAsaas = {
  id?: string;
  subscription?: string;
  externalReference?: string;
};

/** A busca em três campos descrita no corpo de POST, e a ordem dela importa. */
function acharInscricao(pagamento: PagamentoAsaas) {
  return prismaUnscoped.inscricao.findFirst({
    where: {
      OR: [
        { id: pagamento.externalReference ?? SENTINELA },
        { asaasPaymentId: pagamento.id ?? SENTINELA },
        { asaasSubscriptionId: pagamento.subscription ?? SENTINELA },
      ],
    },
  });
}

/**
 * Cartão recusado ou cobrança reprovada no primeiro pagamento de um checkout.
 *
 * Relatório puro: nada aqui muda a Inscricao, que continua AGUARDANDO_PAGAMENTO
 * porque o cliente pode tentar outro cartão na mesma página. Por isso nada
 * aqui propaga. Uma falha de banco devolveria 500 e o Asaas reentregaria um
 * evento que só serve para contar, e o webhook ficaria preso nele.
 *
 * Inscricao já PROVISIONADA fica de fora: aí é renovação de quem já é
 * cliente, que a régua de atraso trata, e não degrau do funil de checkout.
 */
async function registrarRecusa(evento: string, pagamento: PagamentoAsaas) {
  try {
    const inscricao = await acharInscricao(pagamento);
    if (!inscricao || inscricao.status === "PROVISIONADA") return;

    await registrarEvento(prismaUnscoped, {
      sessaoId: inscricao.sessaoId,
      tipo: "PAGAMENTO_RECUSADO",
      detalhe: evento,
    });

    // AVISO em origem que nenhuma peça reclama (ver classificarOrigem): entra
    // no feed da tela de saúde, que é onde alguém olha para ligar para o
    // cliente, sem pintar de amarelo um webhook que funcionou.
    await registrarSaude({
      origem: "funil/pagamento-recusado",
      nivel: "AVISO",
      mensagem: `${evento} no checkout`,
      extra: { inscricaoId: inscricao.id, paymentId: pagamento.id },
    });
    await registrarSaude({
      origem: "webhook/asaas",
      nivel: "OK",
      mensagem: `${evento} registrado`,
      extra: { inscricaoId: inscricao.id },
    });
  } catch (erro) {
    console.error(
      `[webhook/asaas] falha ao registrar ${evento} — payment=${pagamento.id}`,
      erro instanceof Error ? erro.name : "erro"
    );
  }
}
