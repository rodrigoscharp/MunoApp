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
