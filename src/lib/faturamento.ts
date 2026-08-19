/**
 * O que conta como receita, e onde começa o dia.
 *
 * Existe porque as duas metades da mesma tela discordavam. Os cards de
 * /adm liam "hoje" em BRT e contavam pedido ENTREGUE **ou** pago; o gráfico ao
 * lado (/api/analytics) liam "hoje" com `setHours(0,0,0,0)` do servidor — que
 * na Vercel é UTC — e contava só pedido pago. Resultado: entre 21h e meia-noite
 * de Brasília o card e o gráfico mostravam faturamentos diferentes para o mesmo
 * dia, e o dinheiro recebido em espécie na entrega não aparecia no gráfico
 * nunca. Dois números certos por regras diferentes é pior que um número errado:
 * ninguém sabe em qual acreditar.
 *
 * O relógio é parâmetro, como no resto do projeto, para o teste não depender do
 * dia em que roda.
 */

// Brasília não tem horário de verão desde 2019, então o deslocamento é fixo.
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Meia-noite de Brasília do dia em que `agora` cai, em UTC. */
export function inicioDoDiaBRT(agora: Date): Date {
  const emBRT = new Date(agora.getTime() - BRT_OFFSET_MS);
  return new Date(
    Date.UTC(emBRT.getUTCFullYear(), emBRT.getUTCMonth(), emBRT.getUTCDate()) +
      BRT_OFFSET_MS
  );
}

/** Meia-noite de Brasília do dia 1º do mês em que `agora` cai, em UTC. */
export function inicioDoMesBRT(agora: Date): Date {
  const emBRT = new Date(agora.getTime() - BRT_OFFSET_MS);
  return new Date(
    Date.UTC(emBRT.getUTCFullYear(), emBRT.getUTCMonth(), 1) + BRT_OFFSET_MS
  );
}

/** Meia-noite de Brasília de `dias` dias atrás, em UTC. */
export function inicioDeDiasAtrasBRT(agora: Date, dias: number): Date {
  const inicio = inicioDoDiaBRT(agora);
  return new Date(inicio.getTime() - dias * 24 * 60 * 60 * 1000);
}

/** A data de um pedido no calendário de Brasília, como "YYYY-MM-DD". */
export function diaBRT(data: Date): string {
  return new Date(data.getTime() - BRT_OFFSET_MS).toISOString().split("T")[0];
}

/**
 * Pedido que virou dinheiro: entregue (recebido na porta, inclusive em
 * espécie) ou pago antecipadamente (PIX/cartão). Cancelado nunca conta, mesmo
 * que tenha sido pago antes — nesse caso houve estorno, e o número que importa
 * é o do estorno.
 */
export const FILTRO_DE_RECEITA = {
  OR: [{ status: "DELIVERED" as const }, { paymentStatus: "PAID" as const }],
  NOT: { status: "CANCELLED" as const },
};
