/**
 * Decide quem pode ver um pedido.
 *
 * A presença do dono é o único sinal. Pedido de delivery/retirada sempre nasce
 * com dono e fica protegido. Pedido de mesa (DINE_IN) nunca tem dono, e pedidos
 * criados antes do login obrigatório também não têm — ambos seguem acessíveis
 * por link direto, como sempre foram.
 */
export function canViewOrder(
  order: { userId: string | null },
  viewer: { id: string; role: string } | null
): boolean {
  if (order.userId === null) return true;
  if (!viewer) return false;
  return viewer.role === "ADMIN" || viewer.id === order.userId;
}
