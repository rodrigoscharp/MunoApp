/**
 * O instante a partir do qual uma cobrança ainda não está atrasada: a
 * meia-noite UTC do dia de `agora`.
 *
 * `diasDeAtraso` (src/lib/assinatura/regua.ts) compara dias do calendário em
 * UTC, e não instantes. Por isso o `where` que conta atrasadas no banco não
 * pode ser `vencimento < agora`: uma cobrança que vence hoje às 03:00 UTC
 * passaria a contar às 03:01, e o selo do menu discordaria da lista de
 * clientes, que mostra "vence hoje". Com este limite,
 * `vencimento < inicioDoAtraso(agora)` é exatamente `diasDeAtraso(...) > 0`, e
 * `atraso.test.ts` trava isso.
 */
export function inicioDoAtraso(agora: Date): Date {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
}
