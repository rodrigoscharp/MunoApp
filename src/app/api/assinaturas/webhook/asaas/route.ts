import { NextRequest, NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { webhookAutorizado } from "@/lib/assinatura/asaas";
import { provisionTenant } from "@/lib/tenant-provisioning";
import { PRECOS } from "@/lib/plans";
import { competenciaDe, DIA_VENCIMENTO_MAX } from "@/lib/assinatura/competencia";

/**
 * Webhook chamado pelo Asaas quando um pagamento da PLATAFORMA (a Muno
 * cobrando o restaurante pela assinatura, não o restaurante cobrando o
 * cliente dele) muda de status. É este handler que transforma um pagamento
 * confirmado em restaurante provisionado.
 *
 * Roda sozinho, sem ninguém olhando, e o Asaas reentrega a mesma chamada
 * enquanto não receber 200 — para sempre. Duas consequências que moldam o
 * arquivo inteiro:
 *
 * 1. Responder sempre 200, exceto token inválido. Um 404 ou 500 para um
 *    evento que nunca vai casar (pagamento que não é nosso, tipo de evento
 *    que não tratamos) vira reentrega infinita, e não corrige nada.
 * 2. A idempotência é obrigatória. Sem ela, a segunda entrega do mesmo
 *    evento cria um SEGUNDO restaurante para quem pagou uma vez só.
 *
 * NÃO importa nem chama enviarBoasVindas: esse módulo nasce na Task 12, que
 * também é quem liga a chamada aqui.
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
  if (!inscricao) return ok();

  // Idempotência. O Asaas reentrega quando não recebe 200 — sem esta linha,
  // a segunda entrega cria um segundo restaurante para quem pagou uma vez.
  if (inscricao.status === "PROVISIONADA") return ok();

  const agora = new Date();

  // provisionTenant já é transacional, já cria o Setting de identidade, e já
  // traduz P2002 (slug em uso) para um erro específico — reaproveitado
  // inteiro, sem caminho novo de criação de tenant.
  const { tenant } = await provisionTenant({
    nome: inscricao.nome,
    slug: inscricao.slug,
    email: inscricao.email,
    plano: inscricao.plano,
  });

  // valorMensal é sempre o valor de UM mês, inclusive no anual: é o número
  // que o CRM mostra. O total pago do ano vive só na Cobranca abaixo.
  //
  // diaVencimento sai do dia do pagamento, com teto de 28 (DIA_VENCIMENTO_MAX)
  // — não existe mês sem dia 28, então nenhum vencimento cai em data
  // inexistente.
  const diaVencimento = Math.min(agora.getUTCDate(), DIA_VENCIMENTO_MAX);
  const assinatura = await prismaUnscoped.assinatura.create({
    data: {
      tenantId: tenant.id,
      valorMensal: PRECOS[inscricao.plano].mensalCentavos / 100,
      diaVencimento,
      inicioCobranca: agora,
      ciclo: inscricao.ciclo,
      // Sempre presente: os dois ciclos criam assinatura no Asaas (ver
      // src/lib/assinatura/asaas.ts). É este id que faz o job diário
      // (src/app/api/cron/assinaturas/route.ts) pular a geração de cobrança
      // para este cliente — sem ele, o cron cria uma segunda dívida que o
      // Asaas nunca baixa, e a régua bloqueia em 15 dias um cliente
      // adimplente.
      asaasSubscriptionId: inscricao.asaasSubscriptionId,
    },
  });

  // A Cobranca nasce PAGA, espelhando o pagamento que acabou de confirmar. É
  // isto que mantém a régua, o proxy e o CRM funcionando sem saber que existe
  // gateway.
  await prismaUnscoped.cobranca.create({
    data: {
      assinaturaId: assinatura.id,
      competencia: competenciaDe(agora),
      valor: pagamento.value ?? PRECOS[inscricao.plano].mensalCentavos / 100,
      vencimento: agora,
      status: "PAGA",
      pagoEm: agora,
    },
  });

  await prismaUnscoped.inscricao.update({
    where: { id: inscricao.id },
    data: { tenantId: tenant.id, status: "PROVISIONADA" },
  });

  // Fecha o Lead que a rota de checkout registrou, ligando-o ao tenant que
  // acabou de nascer. tenantId: null na cláusula porque um Lead já vinculado
  // a outro tenant não pode ser roubado por este e-mail coincidir.
  await prismaUnscoped.lead.updateMany({
    where: { email: inscricao.email, origem: "checkout", tenantId: null },
    data: { tenantId: tenant.id, status: "FECHADO" },
  });

  return ok();
}
