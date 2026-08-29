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

export type StatusCobranca = "PENDENTE" | "PAGA" | "VENCIDA" | "CANCELADA";

/** O que a tela deve dizer sobre uma cobrança. Sem estilo — isso é da tela. */
export type SituacaoCobranca = "PAGA" | "CANCELADA" | "VENCIDA" | "EM_ABERTO";

/**
 * A situação de uma cobrança para exibição, que NÃO é o mesmo que o status
 * gravado nela.
 *
 * O job diário move o status da assinatura, mas não reescreve o status de
 * cada cobrança: uma fatura atrasada há vinte dias segue PENDENTE no banco.
 * Mostrar "em aberto" nela seria mentir por omissão, então a situação olha a
 * data, como o resto da régua.
 *
 * A ordem das checagens é a regra: PAGA e CANCELADA vencem a data. Quem pagou
 * com atraso pagou, e ver "Vencida" numa fatura já quitada faria o dono do
 * restaurante ligar achando que deve.
 */
export function situacaoDaCobranca(
  cobranca: { status: StatusCobranca; vencimento: Date },
  agora: Date
): SituacaoCobranca {
  if (cobranca.status === "PAGA") return "PAGA";
  if (cobranca.status === "CANCELADA") return "CANCELADA";
  return diasDeAtraso(cobranca.vencimento, agora) >= 1 ? "VENCIDA" : "EM_ABERTO";
}
