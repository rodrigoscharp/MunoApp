/**
 * Decide quem pode ver um pedido.
 *
 * A presença do dono é o único sinal. Pedido de delivery/retirada sempre nasce
 * com dono e fica protegido. Pedidos sem dono são os criados sem sessão — mesa
 * (DINE_IN) pedida por cliente anônimo, além de pedidos legados de antes do
 * login obrigatório — e esses seguem acessíveis por link direto, como sempre
 * foram. Um pedido de mesa feito por cliente logado TEM dono normalmente.
 */
export function canViewOrder(
  order: { userId: string | null },
  viewer: { id: string; role: string } | null
): boolean {
  if (order.userId === null) return true;
  if (!viewer) return false;
  return viewer.role === "ADMIN" || viewer.id === order.userId;
}
