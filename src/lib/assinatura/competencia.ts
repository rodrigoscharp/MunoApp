import type { Ciclo } from "@prisma/client";

/**
 * Competência é o mês de referência da cobrança, no formato "YYYY-MM".
 *
 * Ela existe para ser chave de idempotência: com
 * @@unique([assinaturaId, competencia]), o job diário pode rodar dez vezes no
 * mesmo mês e gerar uma cobrança só. A garantia é do banco, não do código que
 * chama — job roda duas vezes é quando, não se.
 */

/**
 * Vencimento nunca passa do dia 28, teto que a API de cliente já valida desde
 * antes deste projeto. É o que dispensa regra de fim de mês: não existe mês
 * sem dia 28, então nenhum vencimento cai em data inexistente. Custa não
 * poder vencer dia 30; elimina uma classe inteira de bug num número que vira
 * fatura.
 */
export const DIA_VENCIMENTO_MAX = 28;

/**
 * Dia usado quando a plataforma grava uma mensalidade sem escolher vencimento.
 * É o mesmo que o backfill da migração deu a quem já era cliente: sem um padrão
 * único, cada caminho de criação inventaria o seu e clientes iguais venceriam
 * em dias diferentes.
 */
export const DIA_VENCIMENTO_PADRAO = 10;

const FORMATO = /^(\d{4})-(\d{2})$/;

export function competenciaDe(data: Date): string {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  return `${ano}-${mes}`;
}

export function vencimentoDaCompetencia(
  competencia: string,
  diaVencimento: number
): Date {
  const casa = FORMATO.exec(competencia);
  if (!casa) {
    throw new Error(`Competência inválida: "${competencia}". Use "YYYY-MM".`);
  }
  if (
    !Number.isInteger(diaVencimento) ||
    diaVencimento < 1 ||
    diaVencimento > DIA_VENCIMENTO_MAX
  ) {
    throw new Error(
      `Dia de vencimento inválido: ${diaVencimento}. Use de 1 a ${DIA_VENCIMENTO_MAX}.`
    );
  }

  const [, ano, mes] = casa;
  return new Date(Date.UTC(Number(ano), Number(mes) - 1, diaVencimento));
}

/**
 * A data que a tela do restaurante mostra como "próximo vencimento".
 *
 * Não é a mesma pergunta que o job faz. O job só quer saber se já pode cobrar
 * a competência de hoje; a tela precisa responder "quando eu pago de novo?"
 * também para quem está em dia (aí é o mês que vem) e para quem ainda está na
 * cortesia (aí é o primeiro vencimento, que ainda não virou cobrança nenhuma).
 *
 * `vencimentoEmAberto` é o vencimento da cobrança em aberto mais antiga, ou
 * null. Ele vem primeiro mesmo quando já passou: uma fatura vencida não deixa
 * de ser o próximo pagamento por estar atrasada, e apontar para o mês que vem
 * esconderia justamente a dívida.
 */
export function proximoVencimento(
  assinatura: { diaVencimento: number; inicioCobranca: Date; ciclo: Ciclo },
  vencimentoEmAberto: Date | null,
  agora: Date
): Date {
  if (vencimentoEmAberto) return vencimentoEmAberto;

  // Cortesia: a assinatura existe e o job não cobra enquanto inicioCobranca
  // não chega (ver /api/cron/assinaturas). A primeira cobrança é essa data.
  if (assinatura.inicioCobranca > agora) return assinatura.inicioCobranca;

  // O anual não tem "mês que vem": quem pagou o ano só volta a pagar quando o
  // período fecha. Calcular pelo caminho mensal faria a tela do cliente
  // anunciar uma cobrança que não existe.
  if (assinatura.ciclo === "ANUAL") {
    const base = assinatura.inicioCobranca;
    return new Date(
      Date.UTC(
        base.getUTCFullYear() + 1,
        base.getUTCMonth(),
        assinatura.diaVencimento
      )
    );
  }

  const candidato = vencimentoDaCompetencia(
    competenciaDe(agora),
    assinatura.diaVencimento
  );
  // Sem cobrança em aberto e com o vencimento do mês já passado (ou hoje), o
  // mês corrente está pago: o próximo é o do mês seguinte.
  if (candidato.getTime() > agora.getTime()) return candidato;

  const seguinte = new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1)
  );
  return vencimentoDaCompetencia(
    competenciaDe(seguinte),
    assinatura.diaVencimento
  );
}
