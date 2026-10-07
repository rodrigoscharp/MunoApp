/**
 * Todos os números das regras de saúde, num lugar só.
 *
 * Foram escolhidos antes de existir dado real. Ajuste aqui depois de ver o
 * comportamento em produção; nenhum outro arquivo deve ter um limiar escrito.
 */
export const LIMIARES = {
  /** Banco respondendo mais devagar que isto fica amarelo. */
  bancoLentoMs: 500,
  /** O cron roda uma vez por dia; 26 h dá duas horas de folga. */
  cronAmareloH: 26,
  /** Perdeu dois dias seguidos. */
  cronVermelhoH: 50,
  /** Quantas horas de evento a avaliação lê. Cobre a janela do cron. */
  janelaDeEventosH: 50,
  provisionamentoAmareloMin: 15,
  provisionamentoVermelhoMin: 60,
  pagamentosVermelhoNaHora: 3,
  emailVermelhoNaHora: 3,
  rotasAmareloNaHora: 1,
  rotasVermelhoNaHora: 10,
  /** Abaixo desta média histórica na hora, zero pedidos não é sinal de nada. */
  pedidosMediaMinima: 5,
  semanasDeComparacao: 4,
  diasDeRetencao: 30,
  eventosNoFeed: 100,
  /** O filtro por peça é feito em memória sobre este tanto de linhas. */
  eventosLidosNoFeed: 500,
} as const;
