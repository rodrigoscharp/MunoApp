import { auth } from "@/lib/auth";
import { prismaUnscoped } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatCurrency, formatDate, ORDER_STATUS_LABELS } from "@/lib/utils";
import { ArrowRight, MessageSquare, PackageSearch, ShoppingBag } from "lucide-react";
import { OrderStatus } from "@/types";

const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  IN_PREPARATION: "bg-orange-100 text-orange-700",
  READY: "bg-green-100 text-green-700",
  OUT_FOR_DELIVERY: "bg-purple-100 text-purple-700",
  DELIVERED: "bg-neutral-100 text-neutral-600",
  CANCELLED: "bg-red-100 text-red-600",
};

const ACTIVE_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "IN_PREPARATION",
  "READY",
  "OUT_FOR_DELIVERY",
];

export default async function PedidosPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/pedidos");
  }

  const orders = await prismaUnscoped.order.findMany({
    where: { userId: session.user.id, tenantId: session.user.tenantId },
    include: {
      items: { include: { menuItem: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    // Os 50 mais recentes: o histórico inteiro de um cliente fiel, com itens,
    // a cada visita à página, só cresce.
    take: 50,
  });

  const active = orders.filter((o) =>
    ACTIVE_STATUSES.includes(o.status as OrderStatus)
  );
  const past = orders.filter(
    (o) => !ACTIVE_STATUSES.includes(o.status as OrderStatus)
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <ShoppingBag size={22} className="text-brand" />
        <h1 className="text-2xl font-bold text-neutral-900">Meus Pedidos</h1>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-20">
          <PackageSearch size={48} className="mx-auto mb-4 text-neutral-300" />
          <p className="text-neutral-500 font-medium">Nenhum pedido ainda</p>
          <p className="text-neutral-400 text-sm mt-1 mb-6">
            Seus pedidos aparecerão aqui após a compra.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition"
          >
            Ver cardápio
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pedidos ativos */}
          {active.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">
                Em andamento
              </h2>
              <div className="space-y-3">
                {active.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            </section>
          )}

          {/* Histórico */}
          {past.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">
                Histórico
              </h2>
              <div className="space-y-3">
                {past.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
}: {
  order: {
    id: string;
    status: string;
    total: { toString(): string };
    createdAt: Date;
    items: { quantity: number; menuItem: { name: string } }[];
  };
}) {
  const status = order.status as OrderStatus;
  const isActive = ACTIVE_STATUSES.includes(status);

  return (
    <div className="bg-white border border-neutral-200 rounded-xl px-5 py-4 hover:border-brand/40 hover:shadow-sm transition">
      <Link href={`/track/${order.id}`} className="flex items-center justify-between gap-4 group">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="font-mono text-xs font-bold text-neutral-500">
              #{order.id.slice(-6).toUpperCase()}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[status]}`}
            >
              {ORDER_STATUS_LABELS[status]}
            </span>
            {isActive && (
              <span className="flex items-center gap-1 text-xs text-brand font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse inline-block" />
                Ao vivo
              </span>
            )}
          </div>

          <p className="text-sm text-neutral-700 truncate">
            {order.items
              .map((i) => `${i.quantity}× ${i.menuItem.name}`)
              .join(", ")}
          </p>

          <p className="text-xs text-neutral-400 mt-1">
            {formatDate(order.createdAt)}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="font-bold text-neutral-900 text-sm">
            {formatCurrency(Number(order.total))}
          </span>
          <ArrowRight
            size={16}
            className="text-neutral-300 group-hover:text-brand transition"
          />
        </div>
      </Link>

      {/* Botão de chat */}
      <div className="mt-3 pt-3 border-t border-neutral-100 flex justify-end">
        <Link
          href={`/pedidos/${order.id}/chat`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-brand transition"
        >
          <MessageSquare size={13} />
          Chat com o restaurante
        </Link>
      </div>
    </div>
  );
}
