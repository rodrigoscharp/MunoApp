import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getPlanoFromRequest, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { tenantTemMesaQr } from "@/lib/plans";
import { broadcastTenantEvent } from "@/lib/realtime";
import { getEnabledPaymentMethods } from "@/lib/payments/factory";
import { assertMethodAllowed, PaymentMethodNotAllowedError } from "@/lib/payments/method-guard";
import { DeliveryFeeError, resolveDeliveryFee } from "@/lib/delivery-fee";
import { CouponError } from "@/lib/coupon";
import { aplicarCupom } from "@/lib/coupon-lookup";
import { z } from "zod";

// Janela da fila da cozinha. Sem ela, um pedido abandonado (cliente desistiu,
// PIX nunca pago) fica PENDING para sempre e entra em toda resposta do polling,
// crescendo mês a mês. 24h corridas é largo o bastante para cobrir a virada da
// madrugada e nenhum pedido legítimo em preparo. Os antigos continuam visíveis
// no histórico do admin (/adm/orders), que não filtra por status nem por data.
const KITCHEN_WINDOW_MS = 24 * 60 * 60 * 1000;

// Quantos pedidos recentes o sino de notificações acompanha. Notificação de
// pedido antigo não existe: o que interessa é o que ainda está em curso.
const CUSTOMER_ORDERS_LIMIT = 20;

const orderSchema = z.object({
  items: z.array(
    z.object({
      menuItemId: z.string(),
      quantity: z.number().int().positive(),
      notes: z.string().optional(),
    })
  ).min(1),
  paymentMethod: z.enum(["PIX", "CREDIT_CARD", "CASH"]),
  notes: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  deliveryType: z.enum(["PICKUP", "DELIVERY", "DINE_IN"]).default("PICKUP"),
  deliveryAddress: z.string().optional(),
  // O id da zona, não o preço: o valor do frete vem do banco, nunca do cliente.
  deliveryZoneId: z.string().optional(),
  // Mesma regra do frete: só o código. Não existe campo de desconto aqui, então
  // um `discount` extra no corpo da requisição é descartado pelo zod.
  couponCode: z.string().trim().min(1).optional(),
  tableId: z.string().optional(),
}).refine(
  (data) =>
    data.deliveryType !== "DELIVERY" ||
    (data.customerPhone?.trim().length ?? 0) >= 8,
  { path: ["customerPhone"], message: "Telefone é obrigatório para entrega" }
);

export async function GET(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    const { searchParams } = new URL(req.url);
    const isKitchen = searchParams.get("kitchen") === "true";

    if (isKitchen) {
      if (!session || (session.user.role !== "ADMIN" && session.user.role !== "KITCHEN")) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
      }
      const orders = await prisma.order.findMany({
        where: {
          status: { notIn: ["DELIVERED", "CANCELLED"] },
          createdAt: { gte: new Date(Date.now() - KITCHEN_WINDOW_MS) },
        },
        include: {
          items: { include: { menuItem: true } },
          user: { select: { id: true, name: true, email: true } },
          table: { select: { number: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      return NextResponse.json(orders);
    }

    if (session?.user.role === "ADMIN") {
      const orders = await prisma.order.findMany({
        include: {
          items: { include: { menuItem: true } },
          user: { select: { id: true, name: true, email: true } },
          table: { select: { number: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return NextResponse.json(orders);
    }

    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Único consumidor deste ramo é o sino de notificações
    // (useOrderNotifications), que só compara id, status e deliveryType. Antes
    // daqui saía o histórico inteiro do cliente com todos os itens e o menuItem
    // completo — descrição, imagem, preço — a cada ciclo de polling. Um cliente
    // fiel com 200 pedidos recebia os 200, de minuto em minuto.
    const orders = await prisma.order.findMany({
      where: { userId: session.user.id },
      select: { id: true, status: true, deliveryType: true },
      orderBy: { createdAt: "desc" },
      take: CUSTOMER_ORDERS_LIMIT,
    });
    return NextResponse.json(orders);
  });
}

export async function POST(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();

    const body = await req.json();
    const parsed = orderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { items, paymentMethod, notes, customerName, customerPhone, deliveryType, deliveryAddress, deliveryZoneId, couponCode, tableId } = parsed.data;

    // Defesa em profundidade: a tela de /mesa/[token] já não renderiza pra
    // quem não tem o plano, mas um checkout aberto no navegador antes de um
    // downgrade ainda conseguiria bater direto aqui.
    if (deliveryType === "DINE_IN" && !tenantTemMesaQr(getPlanoFromRequest(req))) {
      return apiError("Recurso não disponível neste plano", 403);
    }

    // Delivery e retirada exigem conta. Mesa (DINE_IN) não: o cliente está no
    // restaurante e o pedido é identificado pela mesa.
    if (deliveryType !== "DINE_IN" && !session?.user?.id) {
      return NextResponse.json(
        { error: "Faça login para finalizar o pedido" },
        { status: 401 }
      );
    }

    // Endpoint público: a UI esconder o botão não impede ninguém de pedir
    // PIX num restaurante que não tem gateway conectado.
    try {
      assertMethodAllowed(paymentMethod, await getEnabledPaymentMethods(tenantId));
    } catch (err) {
      if (err instanceof PaymentMethodNotAllowedError) {
        return NextResponse.json({ error: err.message }, { status: 422 });
      }
      throw err;
    }

    // `available: true` faz parte do filtro, e não só do que o cardápio mostra:
    // um carrinho aberto antes de o dono desativar o item continuaria pedindo
    // comida que a cozinha não tem. O mesmo where cobre o tenant (a extensão do
    // Prisma injeta tenantId), então id de outro restaurante também não passa.
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: items.map((i) => i.menuItemId) }, available: true },
    });

    const porId = new Map(menuItems.map((m) => [m.id, m]));

    // Antes daqui, item que não voltou da consulta era ignorado no subtotal e
    // depois desreferenciado com `!` na hora de montar o pedido — TypeError, 500
    // e nenhuma pista do que o cliente pediu de errado. Recusar explicitamente
    // devolve 422 e diz o que saiu do ar.
    const indisponiveis = items.filter((i) => !porId.has(i.menuItemId));
    if (indisponiveis.length > 0) {
      return NextResponse.json(
        { error: "Um ou mais itens do carrinho não estão mais disponíveis." },
        { status: 422 }
      );
    }

    const itemsTotal = items.reduce(
      (sum, orderItem) => sum + Number(porId.get(orderItem.menuItemId)!.price) * orderItem.quantity,
      0
    );

    // O frete sai da zona cadastrada, não de um número enviado na requisição.
    // `prisma` já restringe a busca ao tenant da request, então não dá para
    // usar a zona barata de outro restaurante.
    const zona =
      deliveryType === "DELIVERY" && deliveryZoneId
        ? await prisma.deliveryZone.findUnique({ where: { id: deliveryZoneId } })
        : null;

    let deliveryFee: number;
    try {
      deliveryFee = resolveDeliveryFee(deliveryType, zona);
    } catch (err) {
      if (err instanceof DeliveryFeeError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    // O desconto é recalculado aqui do zero, ignorando o que /api/coupons/validate
    // mostrou no checkout: aquilo era prévia, isto é o que vai ser cobrado.
    // aplicarCupom pode zerar o frete (cupom de frete grátis).
    let cupom;
    try {
      cupom = await aplicarCupom({
        tenantId,
        code: couponCode,
        userId: session?.user?.id,
        deliveryType,
        itemsTotal,
        deliveryFee,
      });
    } catch (err) {
      if (err instanceof CouponError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
    deliveryFee = cupom.deliveryFee;

    const total = itemsTotal + deliveryFee - cupom.discount;

    // A mesa é resolvida contra o banco, não aceita como veio. Sem isto o
    // tableId era gravado direto: id de mesa inativa passava, e id de mesa de
    // OUTRO restaurante também — a foreign key é global e não sabe de tenant,
    // então o pedido nascia apontando para a mesa de outra casa. `prisma` já
    // restringe a consulta ao tenant da request.
    let mesaId: string | null = null;
    if (deliveryType === "DINE_IN" && tableId) {
      const mesa = await prisma.table.findFirst({
        where: { id: tableId, active: true },
        select: { id: true },
      });
      if (!mesa) {
        return NextResponse.json({ error: "Mesa não encontrada." }, { status: 422 });
      }
      mesaId = mesa.id;
    }

    // Lê o tempo estimado de entrega configurado pelo admin
    const timeSetting = await prisma.setting.findUnique({
      where: { tenantId_key: { tenantId, key: "delivery_time_minutes" } },
    });
    const estimatedMinutes = timeSetting ? parseInt(timeSetting.value, 10) : 45;
    const estimatedDeliveryAt = new Date(Date.now() + estimatedMinutes * 60_000);

    const order = await prisma.order.create({
      data: {
        tenantId,
        paymentMethod,
        notes,
        customerName,
        customerPhone,
        deliveryType,
        deliveryAddress: deliveryType === "DELIVERY" ? deliveryAddress : null,
        deliveryFee,
        discount: cupom.discount,
        couponId: cupom.couponId,
        couponCode: cupom.couponCode,
        tableId: mesaId,
        total,
        estimatedDeliveryAt,
        userId: session?.user.id ?? null,
        items: {
          // tenantId explícito: escrita aninhada não passa pela extensão que
          // preenche o tenant automaticamente (ver src/lib/prisma.ts).
          create: items.map((item) => ({
            tenantId,
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            unitPrice: porId.get(item.menuItemId)!.price,
            notes: item.notes,
          })),
        },
      },
      include: { items: { include: { menuItem: true } } },
    });

    await broadcastTenantEvent(tenantId, "kitchen-orders", "order-created", { orderId: order.id });

    return NextResponse.json(order, { status: 201 });
  });
}
