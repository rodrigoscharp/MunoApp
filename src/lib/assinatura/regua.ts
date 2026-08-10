/**
 * A régua de inadimplência.
 *
 * Nunca decide sobre storefront: o pior que este arquivo produz é BLOQUEADA,
 * e quem interpreta isso (src/proxy.ts) só olha rotas /adm. Bloquear gestão é
 * pressão; derrubar o cardápio em horário de pico transfere o prejuízo para o
 * cliente do cliente, e basta um pagamento não conciliado para isso acontecer
 * por engano.
 *
 * O relógio é parâmetro, não Date.now() interno, para o teste não depender do
 * dia em que roda.
 */

export const AVISO_DIAS = 7;
export const BLOQUEIO_DIAS = 15;

export type StatusAssinatura =
  | "ATIVA"
  | "INADIMPLENTE"
  | "BLOQUEADA"
  | "CANCELADA";

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Dias inteiros de atraso, comparando datas de calendário em UTC. Comparar
 * timestamps daria 0 para um vencimento de ontem às 23h visto hoje ao
 * meio-dia — meio dia de diferença, um dia de atraso.
 */
export function diasDeAtraso(vencimento: Date, agora: Date): number {
  const diaDoVencimento = Date.UTC(
    vencimento.getUTCFullYear(),
    vencimento.getUTCMonth(),
    vencimento.getUTCDate()
  );
  const diaDeHoje = Date.UTC(
    agora.getUTCFullYear(),
    agora.getUTCMonth(),
    agora.getUTCDate()
  );
  return Math.round((diaDeHoje - diaDoVencimento) / UM_DIA_MS);
}

export function statusPelaRegua(
  vencimentoMaisAntigo: Date | null,
  agora: Date
): StatusAssinatura {
  if (!vencimentoMaisAntigo) return "ATIVA";

  const atraso = diasDeAtraso(vencimentoMaisAntigo, agora);
  if (atraso >= BLOQUEIO_DIAS) return "BLOQUEADA";
  if (atraso >= AVISO_DIAS) return "INADIMPLENTE";
  return "ATIVA";
}
