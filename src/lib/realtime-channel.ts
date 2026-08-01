// Nome do canal Broadcast, compartilhado entre cliente e servidor — sem
// dependências de servidor, seguro para importar em Client Components.
export function tenantChannelName(tenantId: string, channel: string): string {
  return `tenant:${tenantId}:${channel}`;
}

/** Canal de um pedido: quem está olhando aquele pedido específico. */
export function orderChannel(orderId: string): string {
  return `order:${orderId}`;
}

/**
 * Canal de um cliente: recebe os eventos dos pedidos dele sem precisar assinar
 * um canal por pedido nem escutar o canal do restaurante inteiro. É o que
 * permite o sino de notificações sair do polling.
 */
export function userChannel(userId: string): string {
  return `user:${userId}`;
}

/** Canal da cozinha: a fila inteira do restaurante. */
export const KITCHEN_CHANNEL = "kitchen-orders";
