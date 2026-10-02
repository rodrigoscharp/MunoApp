import { prismaUnscoped } from "@/lib/prisma";
import { listarPagamentosDaAssinatura } from "./asaas";
import { espelharEventoDeAssinatura } from "./espelho";
import { reportarErro } from "@/lib/observabilidade";

/**
 * Rede de segurança do espelho (ver espelho.ts). Para cada assinatura cobrada
 * pelo Asaas pergunta ao gateway pelos pagamentos recentes e passa cada um pelo
 * MESMO espelho do webhook, traduzindo o status do pagamento para o evento
 * equivalente. Sem isto, um webhook de renovação perdido deixa a Cobranca do
 * mês sem existir, e a régua nunca vê o atraso.
 *
 * Idempotente como o espelho: rodar em dia sem novidade não escreve nada.
 */

const EVENTO_POR_STATUS: Record<string, string> = {
  PENDING: "PAYMENT_CREATED",
  OVERDUE: "PAYMENT_OVERDUE",
  RECEIVED: "PAYMENT_RECEIVED",
  CONFIRMED: "PAYMENT_RECEIVED",
  RECEIVED_IN_CASH: "PAYMENT_RECEIVED",
};

// Quantas assinaturas perguntam ao Asaas ao mesmo tempo. Cada chamada tem
// timeout de 15s; em fila única, 300 assinaturas estourariam o tempo do job.
const SIMULTANEAS = 5;

export type ResultadoReconciliacaoCobrancas = {
  assinaturas: number;
  cobrancas: number;
  falhas: number;
};

export async function reconciliarCobrancasDoAsaas(
  agora: Date
): Promise<ResultadoReconciliacaoCobrancas> {
  const assinaturas = await prismaUnscoped.assinatura.findMany({
    where: { asaasSubscriptionId: { not: null }, status: { not: "CANCELADA" } },
    select: { id: true, asaasSubscriptionId: true },
  });

  const resultado = { assinaturas: assinaturas.length, cobrancas: 0, falhas: 0 };

  for (let i = 0; i < assinaturas.length; i += SIMULTANEAS) {
    const lote = assinaturas.slice(i, i + SIMULTANEAS);
    await Promise.all(
      lote.map(async (assinatura) => {
        const subscription = assinatura.asaasSubscriptionId!;
        try {
          const pagamentos = await listarPagamentosDaAssinatura(subscription);
          for (const p of pagamentos) {
            const event = EVENTO_POR_STATUS[p.status];
            if (!event) continue;
            await espelharEventoDeAssinatura(
              {
                event,
                payment: { id: p.id, value: p.value, subscription, dueDate: p.dueDate },
              },
              agora
            );
            resultado.cobrancas++;
          }
        } catch (erro) {
          // Uma assinatura que falha não trava as outras: o dia seguinte
          // tenta de novo, e o webhook continua sendo o caminho principal.
          resultado.falhas++;
          await reportarErro({
            origem: "cron/reconciliacao-cobrancas",
            erro,
            extra: { assinaturaId: assinatura.id },
          });
        }
      })
    );
  }

  return resultado;
}
