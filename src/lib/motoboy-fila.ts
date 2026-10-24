/**
 * O que um `order-updated` do canal da cozinha significa para a fila do
 * motoboy, que lista pedidos READY de delivery ainda sem dono.
 *
 * - `"novo"`: um delivery acabou de ficar pronto; vale aviso e refresh.
 * - `"recarregar"`: algo mudou num pedido que está na lista (outro motoboy
 *   aceitou, a cozinha voltou ou cancelou, o pagamento entrou); refresh mudo.
 * - `null`: movimento da cozinha que não muda esta tela.
 *
 * Antes desta função, todo READY de delivery e todo OUT_FOR_DELIVERY
 * recarregavam a página, inclusive de pedidos que nunca estiveram na lista, e
 * o pedido cancelado ou devolvido ao preparo continuava ali até o próximo
 * recarregamento.
 *
 * O id chega como `orderId` hoje e como `id` no contrato novo. Sem id, vale a
 * regra antiga pelo status, que não depende de saber de qual pedido se trata.
 */
export function reacaoDoMotoboy(
  payload: Record<string, unknown>,
  idsNaLista: readonly string[]
): "novo" | "recarregar" | null {
  const id = (payload.id ?? payload.orderId) as unknown;
  const conhecido = typeof id === "string" && idsNaLista.includes(id);
  const status = payload.status;

  if (status === "READY") {
    if (conhecido) return "recarregar";
    if (payload.deliveryType === "DELIVERY") return "novo";
    // Sem deliveryType não dá para saber se é delivery: recarrega sem alarde,
    // em vez de arriscar o aviso falso ou perder o pedido.
    if (payload.deliveryType === undefined) return "recarregar";
    return null;
  }

  if (conhecido) return "recarregar";
  if (status === "OUT_FOR_DELIVERY" && typeof id !== "string") return "recarregar";
  return null;
}

/** Ids que estão em `atuais` e não estavam em `antes`. */
export function idsNovos(antes: readonly string[], atuais: readonly string[]): string[] {
  const vistos = new Set(antes);
  return atuais.filter((id) => !vistos.has(id));
}
