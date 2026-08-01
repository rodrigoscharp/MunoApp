/**
 * Resolve o valor do frete a partir da zona cadastrada, nunca de um número
 * enviado pelo cliente.
 *
 * A assinatura é a proteção: não existe parâmetro de preço. Antes, o checkout
 * mandava `deliveryFee` no corpo da requisição e o servidor gravava direto —
 * qualquer pessoa com o DevTools aberto pedia entrega de graça.
 */

export type ZonaDeEntrega = {
  price: number | { toString(): string };
  active: boolean;
};

export class DeliveryFeeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryFeeError";
  }
}

export function resolveDeliveryFee(
  deliveryType: string,
  zona: ZonaDeEntrega | null
): number {
  // Retirada e mesa nunca têm frete, independente do que venha na requisição.
  if (deliveryType !== "DELIVERY") return 0;

  if (!zona) {
    throw new DeliveryFeeError("Selecione o bairro de entrega.");
  }
  if (!zona.active) {
    throw new DeliveryFeeError("Este bairro não está mais disponível para entrega.");
  }

  return Number(zona.price.toString());
}
