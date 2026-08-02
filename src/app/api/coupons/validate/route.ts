import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { CouponError } from "@/lib/coupon";
import { aplicarCupom } from "@/lib/coupon-lookup";
import { DeliveryFeeError, resolveDeliveryFee } from "@/lib/delivery-fee";
import { z } from "zod";

/**
 * Prévia do desconto para o checkout mostrar antes de o cliente confirmar.
 *
 * O resultado daqui é só visual. POST /api/orders refaz a validação inteira do
 * zero e é ele quem grava o total — este endpoint não reserva, não trava e não
 * é confiado por ninguém.
 */
const validateSchema = z.object({
  code: z.string().trim().min(1),
  items: z
    .array(
      z.object({
        menuItemId: z.string(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
  deliveryType: z.enum(["PICKUP", "DELIVERY", "DINE_IN"]).default("PICKUP"),
  deliveryZoneId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    // O limite de um uso por cliente só existe se houver cliente identificado.
    // Entrega e retirada já exigem login para fechar o pedido, então exigir
    // aqui também não fecha porta nenhuma.
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Faça login para usar um cupom." },
        { status: 401 }
      );
    }

    const parsed = validateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Cupom inválido." }, { status: 400 });
    }

    const { code, items, deliveryType, deliveryZoneId } = parsed.data;

    // Mesmo cálculo de /api/orders: preço vem do banco, não do carrinho.
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: items.map((i) => i.menuItemId) } },
    });
    const itemsTotal = items.reduce((sum, item) => {
      const menuItem = menuItems.find((m) => m.id === item.menuItemId);
      if (!menuItem) return sum;
      return sum + Number(menuItem.price) * item.quantity;
    }, 0);

    const zona =
      deliveryType === "DELIVERY" && deliveryZoneId
        ? await prisma.deliveryZone.findUnique({ where: { id: deliveryZoneId } })
        : null;

    try {
      const baseFee = resolveDeliveryFee(deliveryType, zona);
      const cupom = await aplicarCupom({
        tenantId,
        code,
        userId: session.user.id,
        deliveryType,
        itemsTotal,
        deliveryFee: baseFee,
      });

      return NextResponse.json({
        code: cupom.couponCode,
        discount: cupom.discount,
        deliveryFee: cupom.deliveryFee,
        freeShipping: cupom.deliveryFee < baseFee,
      });
    } catch (err) {
      if (err instanceof CouponError || err instanceof DeliveryFeeError) {
        return NextResponse.json({ error: err.message }, { status: 422 });
      }
      throw err;
    }
  });
}
