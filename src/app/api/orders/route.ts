import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { broadcastTenantEvent } from "@/lib/realtime";
import { z } from "zod";

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
  deliveryFee: z.number().min(0).optional(),
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
        where: { status: { notIn: ["DELIVERED", "CANCELLED"] } },
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

    const orders = await prisma.order.findMany({
      where: { userId: session.user.id },
      include: { items: { include: { menuItem: true } } },
      orderBy: { createdAt: "desc" },
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

    const { items, paymentMethod, notes, customerName, customerPhone, deliveryType, deliveryAddress, deliveryFee: clientFee, tableId } = parsed.data;

    // Delivery e retirada exigem conta. Mesa (DINE_IN) não: o cliente está no
    // restaurante e o pedido é identificado pela mesa.
    if (deliveryType !== "DINE_IN" && !session) {
      return NextResponse.json(
        { error: "Faça login para finalizar o pedido" },
        { status: 401 }
      );
    }

    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: items.map((i) => i.menuItemId) } },
    });

    const itemsTotal = items.reduce((sum, orderItem) => {
      const menuItem = menuItems.find((m) => m.id === orderItem.menuItemId);
      if (!menuItem) return sum;
      return sum + Number(menuItem.price) * orderItem.quantity;
    }, 0);

    const deliveryFee = deliveryType === "DELIVERY" ? (clientFee ?? 0) : 0;

    const total = itemsTotal + deliveryFee;

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
        tableId: deliveryType === "DINE_IN" ? (tableId ?? null) : null,
        total,
        estimatedDeliveryAt,
        userId: session?.user.id ?? null,
        items: {
          create: items.map((item) => {
            const menuItem = menuItems.find((m) => m.id === item.menuItemId)!;
            return {
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              unitPrice: menuItem.price,
              notes: item.notes,
            };
          }),
        },
      },
      include: { items: { include: { menuItem: true } } },
    });

    await broadcastTenantEvent(tenantId, "kitchen-orders", "order-created", { orderId: order.id });

    return NextResponse.json(order, { status: 201 });
  });
}
