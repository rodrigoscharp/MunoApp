import { DIA_VENCIMENTO_MAX } from "./competencia";

/**
 * A data do primeiro vencimento de uma assinatura nova.
 *
 * A cortesia é negociada caso a caso na conversão do lead — um primeiro
 * cliente ganha trinta dias, um que chegou pronto para assinar começa pagando.
 * Por isso ela é parâmetro e não constante.
 *
 * O relógio é parâmetro, como no resto da régua.
 */

/** Um ano. Acima disso é quase certo ser erro de digitação, não negociação. */
export const CORTESIA_MAX_DIAS = 365;

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Devolve o primeiro dia de vencimento **estritamente depois** do fim da
 * cortesia.
 *
 * Duas decisões embutidas, ambas na direção de nunca cobrar sem aviso:
 *
 * 1. Se o dia contratado é hoje, rola para o mês seguinte. Vencer hoje é
 *    vencer sem prazo nenhum. É a mesma escolha que o backfill da migração
 *    `assinatura_e_cobranca` fez — se os dois caminhos divergissem, um cliente
 *    migrado e um cliente novo com o mesmo dia teriam vencimentos diferentes.
 *
 * 2. A cortesia é piso, não pulo de mês. Trinta dias a partir de 05/08 terminam
 *    em 04/09, e o primeiro vencimento é o dia contratado de setembro — não o
 *    de outubro. Somar um mês inteiro por cima da cortesia daria de graça um
 *    período que ninguém negociou.
 */
export function inicioDaCobranca(
  hoje: Date,
  diasDeCortesia: number,
  diaVencimento: number
): Date {
  if (
    !Number.isInteger(diasDeCortesia) ||
    diasDeCortesia < 0 ||
    diasDeCortesia > CORTESIA_MAX_DIAS
  ) {
    throw new Error(
      `Dias de cortesia inválidos: ${diasDeCortesia}. Use de 0 a ${CORTESIA_MAX_DIAS}.`
    );
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

  // Piso: a partir daqui a cobrança pode nascer. Tudo em UTC, como o resto do
  // módulo, para não depender do fuso de quem roda.
  const fimDaCortesia = new Date(hoje.getTime() + diasDeCortesia * UM_DIA_MS);

  const ano = fimDaCortesia.getUTCFullYear();
  const mes = fimDaCortesia.getUTCMonth();
  const dia = fimDaCortesia.getUTCDate();

  // O dia contratado deste mês serve se ainda vem depois do fim da cortesia;
  // senão, o do mês seguinte. O teto de 28 garante que ele existe em todo mês.
  const mesDoVencimento = diaVencimento > dia ? mes : mes + 1;
  return new Date(Date.UTC(ano, mesDoVencimento, diaVencimento));
}
