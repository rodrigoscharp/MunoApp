import { NextRequest, NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { webhookAutorizado } from "@/lib/assinatura/asaas";
import { provisionarInscricao } from "@/lib/assinatura/provisionamento";

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

// PAYMENT_CREATED e PAYMENT_OVERDUE espelham cobrança de assinatura já
// existente e pertencem à renovação (job de cron), não ao provisionamento.
// Este handler só sabe fazer uma coisa: nascer um restaurante a partir de um
// pagamento confirmado.
const PAGOS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);

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
    };
  } | null;

  const evento = corpo?.event;
  const pagamento = corpo?.payment;
  if (!evento || !pagamento) return ok();

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
  const inscricao = await prismaUnscoped.inscricao.findFirst({
    where: {
      OR: [
        { id: pagamento.externalReference ?? SENTINELA },
        { asaasPaymentId: pagamento.id ?? SENTINELA },
        { asaasSubscriptionId: pagamento.subscription ?? SENTINELA },
      ],
    },
  });

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
    return ok();
  }

  // Idempotência. O Asaas reentrega quando não recebe 200 — sem esta linha,
  // a segunda entrega cria um segundo restaurante para quem pagou uma vez.
  if (inscricao.status === "PROVISIONADA") return ok();

  await provisionarInscricao(inscricao, {
    valorPago: pagamento.value,
    origem: "webhook/asaas",
  });

  return ok();
}
