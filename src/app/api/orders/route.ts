import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getPlanoFromRequest, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { tenantTemMesaQr } from "@/lib/plans";
import { broadcastTenantEvent } from "@/lib/realtime";
import { getEnabledPaymentMethods } from "@/lib/payments/factory";
import { assertMethodAllowed, PaymentMethodNotAllowedError } from "@/lib/payments/method-guard";
import { DeliveryFeeError, resolveDeliveryFee } from "@/lib/delivery-fee";
import { CouponError, normalizeCouponCode } from "@/lib/coupon";
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

// Tetos do corpo. O endpoint é público (mesa não exige conta) e sem limite de
// taxa, então sem teto qualquer um grava pedido de 100 mil unidades ou
// observação de 1 MB, que a cozinha depois renderiza e o polling reenvia.
// Folgados para o uso real: ninguém pede 99 do mesmo prato num cardápio de
// restaurante, e 50 linhas passam de qualquer mesa.
const MAX_QUANTIDADE_POR_ITEM = 99;
const MAX_ITENS_POR_PEDIDO = 50;

// Duplo clique e reenvio por rede ruim chegam em segundos. Mais que isso já é
// alguém que de fato quer um segundo pedido igual.
const JANELA_DUPLICIDADE_MS = 15_000;

const orderSchema = z.object({
  items: z.array(
    z.object({
      menuItemId: z.string().max(64),
      quantity: z.number().int().positive().max(MAX_QUANTIDADE_POR_ITEM),
      notes: z.string().max(200).optional(),
    })
  ).min(1).max(MAX_ITENS_POR_PEDIDO),
  paymentMethod: z.enum(["PIX", "CREDIT_CARD", "CASH"]),
  notes: z.string().max(500).optional(),
  customerName: z.string().max(100).optional(),
  customerPhone: z.string().max(30).optional(),
  deliveryType: z.enum(["PICKUP", "DELIVERY", "DINE_IN"]).default("PICKUP"),
  deliveryAddress: z.string().max(300).optional(),
  // O id da zona, não o preço: o valor do frete vem do banco, nunca do cliente.
  deliveryZoneId: z.string().max(64).optional(),
  // Mesma regra do frete: só o código. Não existe campo de desconto aqui, então
  // um `discount` extra no corpo da requisição é descartado pelo zod.
  couponCode: z.string().trim().min(1).max(30).optional(),
  tableId: z.string().max(64).optional(),
}).refine(
  (data) =>
    data.deliveryType !== "DELIVERY" ||
    (data.customerPhone?.trim().length ?? 0) >= 8,
  { path: ["customerPhone"], message: "Telefone é obrigatório para entrega" }
);

type ItemComparavel = { menuItemId: string; quantity: number; notes?: string | null };

/**
 * O pedido como texto comparável: itens (com observação) em qualquer ordem, e
 * tudo o mais que o cliente preenche. Vazio, null e ausente valem o mesmo.
 */
function assinaturaDoPedido(p: {
  items: ItemComparavel[];
  paymentMethod: string;
  deliveryType: string;
  notes?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryAddress?: string | null;
  couponCode?: string | null;
}) {
  const limpa = (v?: string | null) => (v ?? "").trim();
  const itens = p.items
    .map((i) => `${i.menuItemId}:${i.quantity}:${limpa(i.notes)}`)
    .sort()
    .join("|");
  return JSON.stringify([
    itens,
    p.paymentMethod,
    p.deliveryType,
    limpa(p.notes),
    limpa(p.customerName),
    limpa(p.customerPhone),
    limpa(p.deliveryAddress),
    limpa(p.couponCode),
  ]);
}

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
        // Teto de segurança: a janela de 24h já limita, mas esta rota é
        // consultada a cada 30s por cada tela de cozinha aberta.
        take: 200,
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

    // Corpo que não é JSON é erro do cliente, não do servidor.
    const body = await req.json().catch(() => null);
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

    // A mesa é resolvida contra o banco, não aceita como veio. Sem isto o
    // tableId era gravado direto: id de mesa inativa passava, e id de mesa de
    // OUTRO restaurante também — a foreign key é global e não sabe de tenant,
    // então o pedido nascia apontando para a mesa de outra casa. `prisma` já
    // restringe a consulta ao tenant da request.
    let mesaId: string | null = null;
    // Sem login, a mesa é a única prova de que a pessoa está no restaurante.
    if (deliveryType === "DINE_IN" && !tableId && !session?.user?.id) {
      return NextResponse.json({ error: "Mesa não informada." }, { status: 422 });
    }
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

    // Duplo clique: o mesmo cliente (ou a mesma mesa, quando não há login)
    // mandando o mesmo pedido nos últimos segundos recebe o que acabou de ser
    // gravado em vez de gerar um segundo na cozinha. Roda ANTES do cupom: com
    // cupom de uso único, o segundo clique cairia em "você já usou" e o cliente
    // veria erro mesmo com o pedido criado.
    //
    // "O mesmo pedido" é tudo que o cliente digita, e não só o carrinho: duas
    // pessoas da mesma mesa pedindo "1 Coca" com nomes diferentes, ou o mesmo
    // prato com e sem cebola, são pedidos distintos e não podem se fundir.
    // Sem chave de idempotência do cliente, é a heurística mais estreita que
    // ainda pega o clique duplo.
    const chaveDoSolicitante = session?.user?.id
      ? { userId: session.user.id }
      : mesaId
        ? { tableId: mesaId }
        : null;
    if (chaveDoSolicitante) {
      const recentes = await prisma.order.findMany({
        where: {
          ...chaveDoSolicitante,
          createdAt: { gte: new Date(Date.now() - JANELA_DUPLICIDADE_MS) },
          status: { not: "CANCELLED" },
        },
        include: { items: { include: { menuItem: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      const assinatura = assinaturaDoPedido({
        items,
        paymentMethod,
        deliveryType,
        notes,
        customerName,
        customerPhone,
        deliveryAddress: deliveryType === "DELIVERY" ? deliveryAddress : undefined,
        couponCode: couponCode ? normalizeCouponCode(couponCode) : undefined,
      });
      const repetido = recentes.find(
        (r) =>
          assinaturaDoPedido({
            items: r.items,
            paymentMethod: r.paymentMethod,
            deliveryType: r.deliveryType,
            notes: r.notes,
            customerName: r.customerName,
            customerPhone: r.customerPhone,
            deliveryAddress: r.deliveryAddress,
            couponCode: r.couponCode,
          }) === assinatura
      );
      if (repetido) return NextResponse.json(repetido, { status: 200 });
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

    // Cupom de uso único e pedidos simultâneos: a checagem "já usou?" em
    // aplicarCupom roda antes de gravar, então duas requisições do mesmo cliente
    // passam as duas por ela. Gravado o pedido, confere-se se algum outro com o
    // cupom nasceu antes; o mais novo cancela o próprio, e o desempate por id
    // impede que, nascendo no mesmo instante, os dois se cancelem.
    if (cupom.couponId && session?.user?.id) {
      const anteriores = await prisma.order.count({
        where: {
          userId: session.user.id,
          couponId: cupom.couponId,
          status: { not: "CANCELLED" },
          id: { not: order.id },
          OR: [
            { createdAt: { lt: order.createdAt } },
            { createdAt: order.createdAt, id: { lt: order.id } },
          ],
        },
      });
      if (anteriores > 0) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "CANCELLED" },
        });
        return NextResponse.json({ error: "Você já usou este cupom." }, { status: 400 });
      }
    }

    await broadcastTenantEvent(tenantId, "kitchen-orders", "order-created", { orderId: order.id });

    return NextResponse.json(order, { status: 201 });
  });
}
