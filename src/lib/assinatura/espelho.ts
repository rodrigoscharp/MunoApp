import { prismaUnscoped } from "@/lib/prisma";
import { recalcularStatusDaAssinatura } from "./baixa";
import { competenciaDe } from "./competencia";

/**
 * O espelho local da cobrança que o Asaas emite.
 *
 * Para assinatura cobrada pelo gateway o cron NÃO gera Cobranca (ver
 * src/app/api/cron/assinaturas/route.ts): gerar uma segunda dívida que o Asaas
 * nunca baixa bloquearia um cliente em dia. A contrapartida é esta: cada
 * cobrança que o Asaas emite precisa chegar aqui por webhook, senão a régua não
 * tem o que medir e quem para de pagar no mês 2 nunca fica INADIMPLENTE.
 *
 * Só trata evento de uma Assinatura que já existe. O primeiro pagamento ainda
 * não tem Assinatura (ela nasce no provisionamento, que cria a própria
 * Cobranca já PAGA), então `false` aqui significa "siga para o provisionamento".
 *
 * Idempotente por construção: o Asaas reentrega e entrega fora de ordem, então
 * cada ramo só escreve se o estado atual permitir. Uma Cobranca PAGA nunca
 * reabre; uma CANCELADA pelo operador só volta se o dinheiro de fato entrou.
 */

export type EventoAsaas = {
  event?: string;
  payment?: {
    id?: string;
    value?: number;
    subscription?: string;
    dueDate?: string;
  };
  subscription?: { id?: string };
};

const PAGOS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const EM_ABERTO = new Set(["PAYMENT_CREATED", "PAYMENT_UPDATED", "PAYMENT_OVERDUE"]);
// Dinheiro que voltou: a cobrança deixa de contar como paga.
const REEMBOLSADOS = new Set(["PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED"]);
const ASSINATURA_ENCERRADA = new Set([
  "SUBSCRIPTION_DELETED",
  "SUBSCRIPTION_INACTIVATED",
]);

/** Soma meses sem vazar para o mês seguinte: 31/01 + 1 mês é 28/02. */
function somarMeses(data: Date, meses: number): Date {
  const total = data.getUTCMonth() + meses;
  const ano = data.getUTCFullYear() + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(data.getUTCDate(), ultimoDia)));
}

/** "2026-11-10" → meia-noite UTC, ou null se o formato não bate. */
function vencimentoDe(dueDate: string | undefined): Date | null {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  const data = new Date(`${dueDate}T00:00:00Z`);
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * @returns true se o evento pertence a uma assinatura nossa (ou é de uma
 * assinatura que não é nossa e não há nada a fazer), false se o chamador deve
 * continuar com o fluxo de provisionamento.
 */
export async function espelharEventoDeAssinatura(
  corpo: EventoAsaas,
  agora: Date
): Promise<boolean> {
  const evento = corpo.event;
  if (!evento) return false;

  if (ASSINATURA_ENCERRADA.has(evento)) {
    const id = corpo.subscription?.id;
    const assinatura = id
      ? await prismaUnscoped.assinatura.findUnique({
          where: { asaasSubscriptionId: id },
        })
      : null;
    // Encerrada no gateway NÃO é CANCELADA (cortesia, acesso livre): o último
    // período pago vale até o fim, e depois o proxy bloqueia a gestão.
    // Evento repetido não adia um encerramento já marcado.
    if (assinatura && !assinatura.encerraEm && assinatura.status !== "CANCELADA") {
      const ultimaPaga = await prismaUnscoped.cobranca.findFirst({
        where: { assinaturaId: assinatura.id, status: "PAGA" },
        orderBy: { vencimento: "desc" },
        select: { vencimento: true },
      });
      const fimDoPeriodo = ultimaPaga
        ? assinatura.ciclo === "ANUAL"
          ? somarMeses(ultimaPaga.vencimento, 12)
          : somarMeses(ultimaPaga.vencimento, 1)
        : agora;
      await prismaUnscoped.assinatura.update({
        where: { id: assinatura.id },
        data: { encerraEm: fimDoPeriodo > agora ? fimDoPeriodo : agora },
      });
    }
    return true;
  }

  const pagamento = corpo.payment;
  const idDaAssinatura = pagamento?.subscription;
  if (!pagamento || !idDaAssinatura) return false;
  if (
    !PAGOS.has(evento) &&
    !EM_ABERTO.has(evento) &&
    !REEMBOLSADOS.has(evento) &&
    evento !== "PAYMENT_DELETED"
  ) {
    return false;
  }

  const assinatura = await prismaUnscoped.assinatura.findUnique({
    where: { asaasSubscriptionId: idDaAssinatura },
  });
  if (!assinatura) return false;

  const vencimento = vencimentoDe(pagamento.dueDate);
  if (!vencimento) {
    // Sem vencimento não há competência onde pôr a cobrança. Responder
    // "tratado" corta a reentrega infinita de um payload que não vai melhorar;
    // o log é a única pista.
    console.error(
      `[espelho/asaas] ${evento} sem dueDate legível — payment=${pagamento.id} ` +
        `subscription=${idDaAssinatura} dueDate=${pagamento.dueDate}`
    );
    return true;
  }

  const competencia = competenciaDe(vencimento);
  const valor = pagamento.value ?? Number(assinatura.valorMensal);

  // A cobrança é reconhecida pelo id do pagamento, e só na falta dele pela
  // competência. O vencimento pode ser remarcado no Asaas (muda o mês, não o
  // id); casar só por competência criava uma segunda cobrança no mês novo e
  // deixava a antiga VENCIDA para sempre.
  let existente = pagamento.id
    ? await prismaUnscoped.cobranca.findUnique({
        where: { asaasPaymentId: pagamento.id },
      })
    : null;
  let adotar = false;
  if (!existente) {
    const daCompetencia = await prismaUnscoped.cobranca.findUnique({
      where: { assinaturaId_competencia: { assinaturaId: assinatura.id, competencia } },
    });
    // Cobrança CANCELADA não segura a competência: o Asaas apaga e recria o
    // pagamento do mês com outro id, e descartar o novo deixaria a régua cega.
    if (
      daCompetencia?.asaasPaymentId &&
      daCompetencia.asaasPaymentId !== pagamento.id &&
      daCompetencia.status !== "CANCELADA"
    ) {
      // Outro pagamento do Asaas já ocupa este mês. Escrever por cima
      // misturaria duas cobranças; sem como representar as duas, só o log.
      console.error(
        `[espelho/asaas] ${evento}: competência ${competencia} já é do pagamento ` +
          `${daCompetencia.asaasPaymentId}, ignorando payment=${pagamento.id}`
      );
      return true;
    }
    // Pagamento NOVO do mesmo mês, com a cobrança antiga CANCELADA: o Asaas
    // apagou e recriou. A linha é reaproveitada para o pagamento novo.
    if (
      daCompetencia &&
      daCompetencia.status === "CANCELADA" &&
      daCompetencia.asaasPaymentId &&
      daCompetencia.asaasPaymentId !== pagamento.id &&
      pagamento.id &&
      !REEMBOLSADOS.has(evento) &&
      evento !== "PAYMENT_DELETED"
    ) {
      const pago = PAGOS.has(evento);
      await prismaUnscoped.cobranca.update({
        where: { id: daCompetencia.id },
        data: {
          asaasPaymentId: pagamento.id,
          valor,
          vencimento,
          status: pago ? "PAGA" : evento === "PAYMENT_OVERDUE" ? "VENCIDA" : "PENDENTE",
          pagoEm: pago ? agora : null,
        },
      });
      await recalcularStatusDaAssinatura(assinatura.id, assinatura.status, agora);
      return true;
    }
    existente = daCompetencia;
    // Cobrança anterior a esta coluna (ou criada pelo cron): passa a carregar o id.
    adotar = !!daCompetencia && !!pagamento.id;
  }
  const comId = adotar && pagamento.id ? { asaasPaymentId: pagamento.id } : {};

  if (PAGOS.has(evento)) {
    if (!existente) {
      await prismaUnscoped.cobranca.create({
        data: {
          assinaturaId: assinatura.id,
          competencia,
          valor,
          vencimento,
          status: "PAGA",
          pagoEm: agora,
          asaasPaymentId: pagamento.id ?? null,
        },
      });
    } else if (existente.status !== "PAGA") {
      // Vence até CANCELADA: se o dinheiro entrou, a dívida está paga.
      await prismaUnscoped.cobranca.update({
        where: { id: existente.id },
        data: { status: "PAGA", pagoEm: agora, ...comId },
      });
    }
  } else if (REEMBOLSADOS.has(evento)) {
    if (existente && existente.status === "PAGA") {
      await prismaUnscoped.cobranca.update({
        where: { id: existente.id },
        data: { status: "VENCIDA", pagoEm: null },
      });
      // Restaurante que recebeu o dinheiro de volta é caso de olho humano.
      console.error(
        `[espelho/asaas:estorno] ${evento} em cobrança paga — assinatura=${assinatura.id} payment=${pagamento.id}`
      );
    }
  } else if (evento === "PAYMENT_DELETED") {
    if (existente && existente.status !== "PAGA" && existente.status !== "CANCELADA") {
      await prismaUnscoped.cobranca.update({
        where: { id: existente.id },
        data: { status: "CANCELADA" },
      });
    }
  } else {
    const status = evento === "PAYMENT_OVERDUE" ? "VENCIDA" : "PENDENTE";
    if (!existente) {
      await prismaUnscoped.cobranca.create({
        data: {
          assinaturaId: assinatura.id,
          competencia,
          valor,
          vencimento,
          status,
          asaasPaymentId: pagamento.id ?? null,
        },
      });
    } else if (existente.status === "PENDENTE" || existente.status === "VENCIDA") {
      await prismaUnscoped.cobranca.update({
        where: { id: existente.id },
        data: {
          // OVERDUE promove para VENCIDA; CREATED/UPDATED só reajustam e
          // mantêm o que já estava (um UPDATED não "des-vence" ninguém).
          status: evento === "PAYMENT_OVERDUE" ? "VENCIDA" : existente.status,
          valor,
          vencimento,
          ...comId,
        },
      });
    }
    // PAGA e CANCELADA: evento repetido ou tardio não reabre nada.
  }

  await recalcularStatusDaAssinatura(assinatura.id, assinatura.status, agora);
  return true;
}
