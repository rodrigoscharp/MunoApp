export type TomDoPagamento = "pago" | "pendente" | "na-entrega" | "neutro";

/**
 * O selo de pagamento do card da cozinha.
 *
 * A pergunta que ele responde no balcão é "posso soltar este pedido?". Pix ou
 * cartão sem confirmação é dinheiro que ainda não entrou; dinheiro em espécie
 * não pago é o normal, cobrado na entrega, e por isso não leva o tom de alerta.
 *
 * Campo ausente (contrato novo ainda não no ar, payload antigo) não vira
 * selo nenhum: um "pendente" inventado seria pior que silêncio.
 */
export function rotuloDePagamento(
  metodo: string | null | undefined,
  situacao: string | null | undefined
): { texto: string; tom: TomDoPagamento } | null {
  if (situacao === "PAID") return { texto: "Pago", tom: "pago" };
  if (situacao === "REFUNDED") return { texto: "Estornado", tom: "neutro" };
  if (situacao !== "UNPAID") return null;

  if (metodo === "PIX") return { texto: "PIX pendente", tom: "pendente" };
  if (metodo === "CREDIT_CARD") return { texto: "Cartão pendente", tom: "pendente" };
  if (metodo === "CASH") return { texto: "Dinheiro", tom: "na-entrega" };
  return null;
}
