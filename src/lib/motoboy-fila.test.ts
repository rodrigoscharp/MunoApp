import { describe, expect, it } from "vitest";
import { idsNovos, reacaoDoMotoboy } from "./motoboy-fila";

describe("reacaoDoMotoboy", () => {
  it("delivery que ficou pronto é corrida nova", () => {
    expect(reacaoDoMotoboy({ orderId: "a", status: "READY", deliveryType: "DELIVERY" }, [])).toBe("novo");
    expect(reacaoDoMotoboy({ id: "a", status: "READY", deliveryType: "DELIVERY" }, [])).toBe("novo");
  });

  it("retirada pronta não interessa", () => {
    expect(reacaoDoMotoboy({ id: "a", status: "READY", deliveryType: "PICKUP" }, [])).toBeNull();
  });

  it("pronto sem deliveryType recarrega sem aviso", () => {
    expect(reacaoDoMotoboy({ id: "a", status: "READY" }, [])).toBe("recarregar");
  });

  it("pedido da lista que mudou recarrega: aceito, cancelado, devolvido ou pago", () => {
    for (const status of ["OUT_FOR_DELIVERY", "CANCELLED", "IN_PREPARATION", "READY"]) {
      expect(reacaoDoMotoboy({ id: "a", status }, ["a"])).toBe("recarregar");
    }
    expect(reacaoDoMotoboy({ id: "a", paymentStatus: "PAID" }, ["a"])).toBe("recarregar");
  });

  it("pedido que nunca esteve na lista não custa refresh", () => {
    expect(reacaoDoMotoboy({ id: "z", status: "OUT_FOR_DELIVERY" }, ["a"])).toBeNull();
    expect(reacaoDoMotoboy({ id: "z", status: "IN_PREPARATION" }, ["a"])).toBeNull();
  });

  it("sem id, saída para entrega recarrega (regra antiga)", () => {
    expect(reacaoDoMotoboy({ status: "OUT_FOR_DELIVERY" }, ["a"])).toBe("recarregar");
    expect(reacaoDoMotoboy({ status: "IN_PREPARATION" }, ["a"])).toBeNull();
  });
});

describe("idsNovos", () => {
  it("só os que não estavam antes", () => {
    expect(idsNovos(["a"], ["a", "b"])).toEqual(["b"]);
    expect(idsNovos(["a", "b"], ["a"])).toEqual([]);
  });
});
