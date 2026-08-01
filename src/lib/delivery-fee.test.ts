import { describe, expect, it } from "vitest";
import { DeliveryFeeError, resolveDeliveryFee } from "./delivery-fee";

const zonaAtiva = { price: 8.5, active: true };
const zonaInativa = { price: 8.5, active: false };

describe("resolveDeliveryFee", () => {
  it("cobra o preço da zona numa entrega", () => {
    expect(resolveDeliveryFee("DELIVERY", zonaAtiva)).toBe(8.5);
  });

  it("aceita Decimal do Prisma, não só number", () => {
    // O Prisma devolve Decimal em colunas @db.Decimal; ele só expõe toString().
    const decimalLike = { toString: () => "12.90" };
    expect(resolveDeliveryFee("DELIVERY", { price: decimalLike, active: true })).toBe(12.9);
  });

  it("não cobra frete na retirada, mesmo com uma zona escolhida", () => {
    expect(resolveDeliveryFee("PICKUP", zonaAtiva)).toBe(0);
  });

  it("não cobra frete no pedido de mesa, mesmo com uma zona escolhida", () => {
    expect(resolveDeliveryFee("DINE_IN", zonaAtiva)).toBe(0);
  });

  it("recusa entrega sem zona", () => {
    expect(() => resolveDeliveryFee("DELIVERY", null)).toThrow(DeliveryFeeError);
  });

  it("recusa entrega numa zona desativada", () => {
    expect(() => resolveDeliveryFee("DELIVERY", zonaInativa)).toThrow(DeliveryFeeError);
  });

  it("não cobra frete na retirada mesmo sem zona nenhuma", () => {
    expect(resolveDeliveryFee("PICKUP", null)).toBe(0);
  });
});
