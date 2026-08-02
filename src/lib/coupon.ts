/**
 * Resolve o desconto a partir do cupom cadastrado, nunca de um valor enviado
 * pelo cliente.
 *
 * A assinatura é a proteção, pelo mesmo motivo de resolveDeliveryFee (ver
 * src/lib/delivery-fee.ts): não existe parâmetro de desconto. O checkout manda
 * o código; quanto ele vale é decisão do servidor, lida do banco. Um campo de
 * valor aqui seria o bug do frete de novo, agora dando o pedido inteiro de
 * graça em vez de só a entrega.
 */

import { z } from "zod";
import { formatCurrency } from "./utils";

/**
 * Validação do cadastro de cupom, compartilhada por POST /api/coupons e
 * PATCH /api/coupons/[id]. Mora aqui e não no arquivo de rota porque as duas
 * rotas precisam dela — e um `import` de valor entre módulos de rota do Next é
 * pedir problema.
 */
export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, "Código deve ter pelo menos 3 caracteres")
      .max(30, "Código muito longo"),
    type: z.enum(["PERCENT", "FIXED", "FREE_SHIPPING"]),
    value: z.number().nonnegative().default(0),
    minOrder: z.number().nonnegative().default(0),
    validFrom: z.coerce.date().nullable().optional(),
    validUntil: z.coerce.date().nullable().optional(),
    active: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.type === "PERCENT" && (data.value <= 0 || data.value > 100)) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "A porcentagem deve ficar entre 1 e 100",
      });
    }
    if (data.type === "FIXED" && data.value <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Informe o valor do desconto",
      });
    }
    if (data.validFrom && data.validUntil && data.validUntil < data.validFrom) {
      ctx.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "A data final não pode ser antes da inicial",
      });
    }
  });

export type CupomCadastrado = {
  type: "PERCENT" | "FIXED" | "FREE_SHIPPING";
  value: number | { toString(): string };
  minOrder: number | { toString(): string };
  validFrom: Date | null;
  validUntil: Date | null;
  active: boolean;
};

export class CouponError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CouponError";
  }
}

/**
 * Cupom é digitado à mão, então "  dez off " e "DEZOFF" têm que ser o mesmo
 * registro. Normalizar nos dois lados — no cadastro e na busca — é o que faz o
 * @@unique([tenantId, code]) valer de verdade.
 */
export function normalizeCouponCode(code: string): string {
  return code.trim().replace(/\s+/g, "").toUpperCase();
}

/** Decimal do Prisma só expõe toString(); o resto do projeto converte na borda. */
function paraNumero(valor: number | { toString(): string }): number {
  return Number(valor.toString());
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function resolveCoupon(params: {
  cupom: CupomCadastrado | null;
  deliveryType: string;
  /** Subtotal dos itens, sem o frete: é sobre ele que o desconto incide. */
  itemsTotal: number;
  deliveryFee: number;
  /** Quantos pedidos não cancelados deste cliente já usaram o cupom. */
  usosDoCliente: number;
  agora?: Date;
}): { discount: number; deliveryFee: number } {
  const { cupom, deliveryType, itemsTotal, deliveryFee, usosDoCliente } = params;
  const agora = params.agora ?? new Date();

  if (!cupom) {
    throw new CouponError("Cupom não encontrado.");
  }

  // Promoção é de canal: quem está sentado na mesa não passa por cupom.
  if (deliveryType === "DINE_IN") {
    throw new CouponError("Cupom não é válido em pedidos de mesa.");
  }

  if (!cupom.active) {
    throw new CouponError("Este cupom não está mais disponível.");
  }

  if (cupom.validFrom && agora < cupom.validFrom) {
    throw new CouponError("Este cupom ainda não está valendo.");
  }

  if (cupom.validUntil && agora > cupom.validUntil) {
    throw new CouponError("Cupom expirado.");
  }

  const minOrder = paraNumero(cupom.minOrder);
  if (itemsTotal < minOrder) {
    throw new CouponError(
      `Este cupom vale em pedidos a partir de ${formatCurrency(minOrder)}.`
    );
  }

  if (usosDoCliente > 0) {
    throw new CouponError("Você já usou este cupom.");
  }

  if (cupom.type === "FREE_SHIPPING") {
    if (deliveryType !== "DELIVERY") {
      throw new CouponError("Este cupom é válido apenas para entrega.");
    }
    return { discount: 0, deliveryFee: 0 };
  }

  const value = paraNumero(cupom.value);
  const bruto = cupom.type === "PERCENT" ? (itemsTotal * value) / 100 : value;

  // O desconto para no subtotal: nem o frete é abatido por PERCENT/FIXED, nem o
  // total pode ficar negativo e virar crédito.
  const discount = arredondar(Math.min(bruto, itemsTotal));

  return { discount, deliveryFee };
}
