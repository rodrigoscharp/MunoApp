import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { broadcastTenantEvent } from "@/lib/realtime";
import { orderChannel } from "@/lib/realtime-channel";
import { canViewOrder } from "@/lib/order-access";

interface Params {
  params: Promise<{ orderId: string }>;
}

// Geocodifica endereço → coordenadas usando Nominatim (OpenStreetMap, gratuito)
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=br`;

    const res = await fetch(url, {
      headers: { "User-Agent": "MunoFood/1.0 (delivery-tracking)" },
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

// Calcula duração da rota de moto via OSRM (gratuito, OpenStreetMap)
// Retorna duração em segundos
async function getRouteDurationSeconds(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<number | null> {
  try {
    // OSRM usa formato longitude,latitude
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${fromLng},${fromLat};${toLng},${toLat}?overview=false`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) return null;

    return Math.ceil(data.routes[0].duration); // segundos
  } catch {
    return null;
  }
}

// POST /api/motoboy/orders/[orderId]/location — atualiza posição GPS do motoboy
export async function POST(req: Request, { params }: Params) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (!session?.user || (session.user.role !== "MOTOBOY" && session.user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { orderId } = await params;
    const body = await req.json();
    const { lat, lng } = body as { lat: number; lng: number };

    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return NextResponse.json({ error: "Coordenadas inválidas" }, { status: 400 });
    }

    // A entrega precisa ser deste motoboy. O papel MOTOBOY sozinho não basta:
    // como o rastreamento é endereçado pelo orderId, qualquer entregador do
    // restaurante conseguia empurrar a própria posição para a entrega de um
    // colega — o mapa do cliente passava a seguir a moto errada, e o `upsert`
    // gravava sem reclamar porque o `create` só define motoboyId na primeira
    // vez. ADMIN escapa da regra: é ele quem opera a conta quando o celular do
    // entregador falha.
    const pedido = await prisma.order.findUnique({
      where: { id: orderId },
      select: { motoboyId: true, deliveryAddress: true },
    });
    if (!pedido) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }
    if (session.user.role !== "ADMIN" && pedido.motoboyId !== session.user.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    // Verifica se é a primeira atualização de localização
    const existing = await prisma.deliveryTracking.findUnique({
      where: { orderId },
      select: { id: true },
    });
    const isFirstUpdate = !existing;

    const tracking = await prisma.deliveryTracking.upsert({
      where: { orderId },
      update: { lat, lng },
      create: { tenantId, orderId, motoboyId: session.user.id, lat, lng },
    });

    // O mapa do cliente lia DeliveryTracking direto por postgres_changes com a
    // chave anon — único jeito de funcionar, já que a tabela era a única sem
    // RLS. Publicando aqui, o mapa passa a viver no canal do tenant e a tabela
    // pode ser fechada.
    await broadcastTenantEvent(tenantId, orderChannel(orderId), "tracking-updated", {
      orderId,
      lat,
      lng,
      updatedAt: tracking.updatedAt.toISOString(),
    });

    // Na primeira atualização, calcula a previsão pela rota real. O endereço já
    // veio na leitura da autorização acima — não há segunda ida ao banco.
    if (isFirstUpdate && pedido.deliveryAddress) {
      // Geocodifica destino e calcula rota em paralelo com a resposta
      // Usa Promise sem await para não bloquear a resposta ao motoboy
      recalculateETA(tenantId, orderId, lat, lng, pedido.deliveryAddress).catch(() => {});
    }

    return NextResponse.json(tracking);
  });
}

// Calcula e persiste a previsão de entrega baseada na rota real
async function recalculateETA(
  tenantId: string,
  orderId: string,
  motoboyLat: number,
  motoboyLng: number,
  deliveryAddress: string
) {
  const destination = await geocodeAddress(deliveryAddress);
  if (!destination) return;

  const durationSeconds = await getRouteDurationSeconds(
    motoboyLat,
    motoboyLng,
    destination.lat,
    destination.lng
  );
  if (!durationSeconds) return;

  // Adiciona 5 minutos de margem para preparação/saída
  const bufferSeconds = 5 * 60;
  const estimatedDeliveryAt = new Date(Date.now() + (durationSeconds + bufferSeconds) * 1000);

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { estimatedDeliveryAt },
  });

  await broadcastTenantEvent(tenantId, orderChannel(orderId), "order-updated", {
    status: updated.status,
    updatedAt: updated.updatedAt.toISOString(),
    estimatedDeliveryAt: updated.estimatedDeliveryAt?.toISOString() ?? null,
  });
}

// GET /api/motoboy/orders/[orderId]/location — retorna posição atual
//
// Quem consome é o mapa do cliente (LiveDeliveryTracker), não o motoboy, então
// o guard é o mesmo da página de track: canViewOrder. Sem ele, e como o
// rastreamento é buscado pelo orderId, qualquer id de pedido devolvia a posição
// GPS ao vivo do motoboy de qualquer restaurante.
export async function GET(req: Request, { params }: Params) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const { orderId } = await params;
    const session = await auth();

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });
    if (!order || !canViewOrder(order, session?.user ?? null)) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    const tracking = await prisma.deliveryTracking.findUnique({
      where: { orderId },
    });

    if (!tracking) {
      return NextResponse.json({ error: "Rastreamento não iniciado" }, { status: 404 });
    }

    return NextResponse.json(tracking);
  });
}
