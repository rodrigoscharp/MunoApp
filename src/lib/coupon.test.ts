import { describe, expect, it } from "vitest";
import { CouponError, resolveCoupon } from "./coupon";

const AGORA = new Date("2026-08-02T12:00:00Z");

function cupom(overrides: Partial<Parameters<typeof resolveCoupon>[0]["cupom"] & object> = {}) {
  return {
    type: "PERCENT" as const,
    value: 10,
    minOrder: 0,
    validFrom: null,
    validUntil: null,
    active: true,
    ...overrides,
  };
}

function aplicar(params: Partial<Parameters<typeof resolveCoupon>[0]> = {}) {
  return resolveCoupon({
    cupom: cupom(),
    deliveryType: "DELIVERY",
    itemsTotal: 100,
    deliveryFee: 8,
    usosDoCliente: 0,
    agora: AGORA,
    ...params,
  });
}

describe("resolveCoupon", () => {
  describe("cálculo", () => {
    it("abate a porcentagem do subtotal dos itens", () => {
      expect(aplicar()).toEqual({ discount: 10, deliveryFee: 8 });
    });

    it("abate o valor fixo do subtotal", () => {
      const cupomFixo = cupom({ type: "FIXED", value: 15 });
      expect(aplicar({ cupom: cupomFixo })).toEqual({ discount: 15, deliveryFee: 8 });
    });

    it("zera o frete no cupom de frete grátis, sem mexer no subtotal", () => {
      const freteGratis = cupom({ type: "FREE_SHIPPING" });
      expect(aplicar({ cupom: freteGratis })).toEqual({ discount: 0, deliveryFee: 0 });
    });

    it("nunca desconta mais que o subtotal, pra o total não ficar negativo", () => {
      const cupomFixo = cupom({ type: "FIXED", value: 500 });
      expect(aplicar({ cupom: cupomFixo, itemsTotal: 30 })).toEqual({ discount: 30, deliveryFee: 8 });
    });

    it("não desconta o frete: 10% de 100 com frete 8 é 10, não 10,80", () => {
      expect(aplicar({ itemsTotal: 100, deliveryFee: 8 }).discount).toBe(10);
    });

    it("arredonda o desconto em duas casas", () => {
      // 15% de 33,33 = 4,9995 — sem arredondar, viraria um Decimal(10,2) truncado
      // pelo banco e o total gravado não bateria com o mostrado no checkout.
      expect(aplicar({ cupom: cupom({ value: 15 }), itemsTotal: 33.33 }).discount).toBe(5);
    });

    it("aceita Decimal do Prisma em value e minOrder, não só number", () => {
      const decimalLike = (v: string) => ({ toString: () => v });
      const resultado = aplicar({
        cupom: cupom({ type: "FIXED", value: decimalLike("12.90"), minOrder: decimalLike("50.00") }),
        itemsTotal: 60,
      });
      expect(resultado.discount).toBe(12.9);
    });

    it("aplica em retirada, não só em entrega", () => {
      expect(aplicar({ deliveryType: "PICKUP", deliveryFee: 0 })).toEqual({ discount: 10, deliveryFee: 0 });
    });
  });

  describe("recusas", () => {
    it("recusa código que não existe", () => {
      expect(() => aplicar({ cupom: null })).toThrow(CouponError);
    });

    it("recusa pedido de mesa", () => {
      expect(() => aplicar({ deliveryType: "DINE_IN", deliveryFee: 0 })).toThrow(
        /mesa/i
      );
    });

    it("recusa cupom desativado", () => {
      expect(() => aplicar({ cupom: cupom({ active: false }) })).toThrow(CouponError);
    });

    it("recusa cupom que ainda não começou", () => {
      const futuro = cupom({ validFrom: new Date("2026-09-01T00:00:00Z") });
      expect(() => aplicar({ cupom: futuro })).toThrow(/ainda não/i);
    });

    it("recusa cupom expirado", () => {
      const vencido = cupom({ validUntil: new Date("2026-08-01T00:00:00Z") });
      expect(() => aplicar({ cupom: vencido })).toThrow(/expirado/i);
    });

    it("aceita cupom dentro da janela de validade", () => {
      const vigente = cupom({
        validFrom: new Date("2026-08-01T00:00:00Z"),
        validUntil: new Date("2026-08-31T23:59:59Z"),
      });
      expect(aplicar({ cupom: vigente }).discount).toBe(10);
    });

    it("recusa quando o subtotal está abaixo do pedido mínimo", () => {
      expect(() => aplicar({ cupom: cupom({ minOrder: 50 }), itemsTotal: 40 })).toThrow(
        CouponError
      );
    });

    it("o frete não conta para atingir o pedido mínimo", () => {
      // Subtotal 45 + frete 8 = 53, mas o mínimo é sobre os itens.
      expect(() =>
        aplicar({ cupom: cupom({ minOrder: 50 }), itemsTotal: 45, deliveryFee: 8 })
      ).toThrow(CouponError);
    });

    it("aceita subtotal exatamente igual ao pedido mínimo", () => {
      expect(aplicar({ cupom: cupom({ minOrder: 50 }), itemsTotal: 50 }).discount).toBe(5);
    });

    it("diz o valor mínimo na mensagem, pra o cliente saber quanto falta", () => {
      expect(() => aplicar({ cupom: cupom({ minOrder: 50 }), itemsTotal: 40 })).toThrow(
        /50,00/
      );
    });

    it("recusa quando o cliente já usou o cupom", () => {
      expect(() => aplicar({ usosDoCliente: 1 })).toThrow(/já usou/i);
    });

    it("recusa frete grátis na retirada, onde não existe frete", () => {
      expect(() =>
        aplicar({ cupom: cupom({ type: "FREE_SHIPPING" }), deliveryType: "PICKUP", deliveryFee: 0 })
      ).toThrow(/entrega/i);
    });
  });
});
