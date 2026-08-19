import type { DeliveryType, OrderStatus } from "@/types";

/**
 * Para onde o botão de avançar do quadro da cozinha leva cada pedido.
 *
 * O último passo depende do tipo de entrega, e é aí que estava o bug: o mapa
 * levava READY direto para DELIVERED em todos os casos. Para retirada
 * ("Retirado") e mesa ("Servido") isso é o desfecho certo — o pedido saiu das
 * mãos da cozinha e acabou ali. Para delivery não: o botão diz "Saiu p/
 * entrega", e entregue é o que o motoboy grava quando chega no cliente.
 *
 * A diferença não era cosmética. A fila do motoboy busca
 * `{ status: READY, motoboyId: null }`: marcado DELIVERED, o pedido sumia da
 * fila antes de qualquer um poder aceitá-lo, era contado como entregue ainda no
 * balcão, e o passo "Em entrega" do rastreamento do cliente nunca acontecia.
 *
 * Fluxo de um delivery:
 *   READY → OUT_FOR_DELIVERY → DELIVERED
 *
 * Os dois últimos passos têm dois caminhos, e é de propósito. O normal é o
 * motoboy: ele aceita pelo app (READY → OUT_FOR_DELIVERY, gravando o
 * motoboyId) e conclui ao chegar (→ DELIVERED). Mas a cozinha também percorre
 * os dois pelo quadro, porque restaurante que entrega sem motoboy cadastrado
 * precisa fechar o pedido de algum lugar — e a rota /complete do motoboy exige
 * ser o dono do pedido, então ninguém mais conseguiria.
 */
const PROXIMO_ATE_PRONTO: Record<string, OrderStatus> = {
  PENDING: "CONFIRMED",
  CONFIRMED: "IN_PREPARATION",
  IN_PREPARATION: "READY",
};

const ANTERIOR: Record<string, OrderStatus> = {
  CONFIRMED: "PENDING",
  IN_PREPARATION: "CONFIRMED",
  READY: "IN_PREPARATION",
  // Voltar daqui devolve o pedido à fila do motoboy, que busca READY.
  OUT_FOR_DELIVERY: "READY",
};

export function proximoStatus(
  status: OrderStatus,
  deliveryType: DeliveryType
): OrderStatus | null {
  if (status === "READY") {
    return deliveryType === "DELIVERY" ? "OUT_FOR_DELIVERY" : "DELIVERED";
  }
  if (status === "OUT_FOR_DELIVERY") return "DELIVERED";
  return PROXIMO_ATE_PRONTO[status] ?? null;
}

export function statusAnterior(status: OrderStatus): OrderStatus | null {
  return ANTERIOR[status] ?? null;
}
