import { describe, expect, it } from "vitest";
import { proximoStatus, statusAnterior } from "@/lib/kitchen-flow";

describe("proximoStatus", () => {
  it("avança do pendente ao pronto igual para todo tipo de entrega", () => {
    for (const tipo of ["DELIVERY", "PICKUP", "DINE_IN"] as const) {
      expect(proximoStatus("PENDING", tipo)).toBe("CONFIRMED");
      expect(proximoStatus("CONFIRMED", tipo)).toBe("IN_PREPARATION");
      expect(proximoStatus("IN_PREPARATION", tipo)).toBe("READY");
    }
  });

  /**
   * O bug. O botão dizia "Saiu p/ entrega" e gravava DELIVERED: o pedido era
   * dado como entregue ainda no balcão e saía da fila do motoboy — que busca
   * `status: READY` — antes de qualquer um poder aceitá-lo. O passo "Em
   * entrega" do rastreamento do cliente nunca acontecia.
   */
  it("manda pedido de entrega para OUT_FOR_DELIVERY, não para entregue", () => {
    expect(proximoStatus("READY", "DELIVERY")).toBe("OUT_FOR_DELIVERY");
  });

  it("fecha retirada e mesa direto em DELIVERED", () => {
    expect(proximoStatus("READY", "PICKUP")).toBe("DELIVERED");
    expect(proximoStatus("READY", "DINE_IN")).toBe("DELIVERED");
  });

  /**
   * O pedido em rua continua no quadro, numa coluna própria, e a cozinha pode
   * fechá-lo. Sem isso, restaurante que entrega sem motoboy cadastrado ficava
   * com o pedido presos em OUT_FOR_DELIVERY para sempre: a fila do motoboy só
   * mostra READY, e a rota /complete exige que o motoboy seja o dono do pedido.
   */
  it("fecha em DELIVERED o que já saiu para entrega", () => {
    expect(proximoStatus("OUT_FOR_DELIVERY", "DELIVERY")).toBe("DELIVERED");
  });

  it("não avança o que já terminou", () => {
    expect(proximoStatus("DELIVERED", "DELIVERY")).toBeNull();
    expect(proximoStatus("CANCELLED", "DELIVERY")).toBeNull();
  });
});

describe("statusAnterior", () => {
  it("volta um passo dentro do quadro", () => {
    expect(statusAnterior("CONFIRMED")).toBe("PENDING");
    expect(statusAnterior("IN_PREPARATION")).toBe("CONFIRMED");
    expect(statusAnterior("READY")).toBe("IN_PREPARATION");
  });

  // Clicou "Saiu p/ entrega" sem querer: dá para voltar para PRONTO, e o
  // pedido reaparece na fila do motoboy.
  it("volta de 'em entrega' para pronto", () => {
    expect(statusAnterior("OUT_FOR_DELIVERY")).toBe("READY");
  });

  it("não volta do primeiro status nem do que já terminou", () => {
    expect(statusAnterior("PENDING")).toBeNull();
    expect(statusAnterior("DELIVERED")).toBeNull();
  });
});
