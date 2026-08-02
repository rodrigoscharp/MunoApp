/**
 * Ponte entre o banco e a regra pura de src/lib/coupon.ts.
 *
 * Existe para que POST /api/orders e POST /api/coupons/validate façam a mesma
 * coisa exatamente do mesmo jeito. Se a validação do checkout e a do pedido
 * divergirem, o cliente vê um desconto que não vai ser cobrado — ou o contrário.
 */

import { prisma } from "./prisma";
import { normalizeCouponCode, resolveCoupon } from "./coupon";

export type CupomAplicado = {
  discount: number;
  deliveryFee: number;
  couponId: string | null;
  couponCode: string | null;
};

export async function aplicarCupom(params: {
  tenantId: string;
  /** O código digitado. Nunca um valor: quanto vale é decisão daqui pra dentro. */
  code: string | undefined;
  userId: string | null | undefined;
  deliveryType: string;
  itemsTotal: number;
  deliveryFee: number;
}): Promise<CupomAplicado> {
  const { tenantId, code, userId, deliveryType, itemsTotal, deliveryFee } = params;

  if (!code) {
    return { discount: 0, deliveryFee, couponId: null, couponCode: null };
  }

  const normalizado = normalizeCouponCode(code);
  const cupom = await prisma.coupon.findUnique({
    where: { tenantId_code: { tenantId, code: normalizado } },
  });

  // Um pedido cancelado devolve o cupom ao cliente. PIX abandonado vira pedido
  // cancelado com frequência (ver a janela da cozinha em /api/orders), e queimar
  // a promoção de quem desistiu de pagar seria punir o cliente errado.
  const usosDoCliente =
    cupom && userId
      ? await prisma.order.count({
          where: { userId, couponId: cupom.id, status: { not: "CANCELLED" } },
        })
      : 0;

  const resolvido = resolveCoupon({
    cupom,
    deliveryType,
    itemsTotal,
    deliveryFee,
    usosDoCliente,
  });

  // resolveCoupon lança CouponError("Cupom não encontrado") quando cupom é null,
  // então chegar aqui já garante que ele existe — o TypeScript é que não sabe.
  return {
    ...resolvido,
    couponId: cupom!.id,
    couponCode: cupom!.code,
  };
}
