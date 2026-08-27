/**
 * Formatação das datas da tela de assinatura.
 *
 * O par formatarData/formatarInstante existe porque os dois campos que a tela
 * mostra são de naturezas diferentes, e ler ambos no mesmo fuso erra um dos
 * dois por um dia — sempre no sentido que gera ligação de cliente.
 */

/**
 * Vencimento é DATA, não instante: o dia 10 é o dia 10 em qualquer lugar. Por
 * isso UTC — no fuso de Brasília, meia-noite UTC do dia 10 seria 21h do dia 9
 * e toda fatura apareceria vencendo um dia antes do combinado.
 */
export function formatarData(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(data);
}

/**
 * `pagoEm`, ao contrário do vencimento, é um instante de verdade — a hora em
 * que a baixa entrou. Ele se formata no fuso de Brasília, porque um pagamento
 * das 22h vira o dia seguinte se lido em UTC, e o cliente jura que pagou antes.
 */
export function formatarInstante(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

/** "2026-08" vira "08/2026". Competência é chave, não número: o zero fica. */
export function formatarCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}
