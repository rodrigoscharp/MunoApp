import { prismaUnscoped } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getRequestTenantId } from "@/lib/tenant-request";
import { canViewOrder } from "@/lib/order-access";
import { OrderTracker } from "@/components/tracking/OrderTracker";
import { toQrImageSrc } from "@/lib/pix-qr";
import { getRestaurantInfo } from "@/lib/restaurant";

interface Props {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ pix?: string; copy?: string; payment?: string }>;
}

export default async function TrackPage({ params, searchParams }: Props) {
  const { orderId } = await params;
  const { pix, copy, payment } = await searchParams;
  const session = await auth();

  const tenantId = await getRequestTenantId();
  // O cadastro sai do cache do restaurante (60s): é a mesma leitura do
  // cabeçalho, e o link de avaliação vem junto sem consulta nova.
  const [order, restaurante] = await Promise.all([
    prismaUnscoped.order.findUnique({
      where: { id: orderId, tenantId },
      include: {
        items: { include: { menuItem: true } },
        deliveryTracking: true,
      },
    }),
    getRestaurantInfo(tenantId),
  ]);

  if (!order || !canViewOrder(order, session?.user ?? null)) notFound();

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-4">
      {/* Payment result feedback */}
      {payment === "success" && (
        <div role="status" className="mb-3 rounded-[20px] bg-loja-folha px-4 py-3 text-center">
          <p className="text-sm font-extrabold text-forest-dark">Pagamento aprovado!</p>
        </div>
      )}
      {payment === "failure" && (
        <div role="alert" className="mb-3 rounded-[20px] bg-loja-pessego px-4 py-3 text-center">
          <p className="text-sm font-extrabold text-loja-preco">
            Pagamento não aprovado. Tente novamente.
          </p>
        </div>
      )}

      {/* Real-time order tracker */}
      <OrderTracker
        orderId={orderId}
        initialStatus={order.status}
        canChat={!!order.userId && order.userId === session?.user?.id}
        avaliacao={
          restaurante.avaliacaoGoogleUrl
            ? { url: restaurante.avaliacaoGoogleUrl, restaurante: restaurante.name }
            : null
        }
        // O bloco do Pix vai para o tracker, que troca o QR por "Pagamento
        // confirmado" quando o pagamento entra (tempo real ou polling). Pedido
        // que já chega pago não recebe o QR.
        pix={
          order.paymentMethod === "PIX" && order.paymentStatus !== "PAID" && (pix || copy)
            ? { qrSrc: toQrImageSrc(pix), copyPaste: copy ?? "" }
            : null
        }
        order={{
          id: order.id,
          status: order.status,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          total: Number(order.total),
          deliveryFee: Number(order.deliveryFee),
          discount: Number(order.discount),
          couponCode: order.couponCode,
          createdAt: order.createdAt,
          estimatedDeliveryAt: order.estimatedDeliveryAt ?? null,
          deliveryAddress: order.deliveryAddress,
          deliveryType: order.deliveryType,
          initialLat: order.deliveryTracking?.lat ?? null,
          initialLng: order.deliveryTracking?.lng ?? null,
          items: order.items.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            notes: item.notes,
            menuItem: {
              id: item.menuItem.id,
              name: item.menuItem.name,
              imageUrl: item.menuItem.imageUrl,
            },
          })),
        }}
      />
    </div>
  );
}
