"use client";

import { useKitchenOrders } from "@/hooks/useKitchenOrders";
import { formatCurrency, ORDER_STATUS_LABELS } from "@/lib/utils";
import { OrderStatus, OrderWithItems } from "@/types";
import { Clock, ChefHat, CheckCircle, RefreshCw, AlertTriangle, ChevronLeft, Bike, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";

const KITCHEN_COLUMNS: { status: OrderStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { status: "PENDING", label: "Pendente", icon: <Clock size={15} />, color: "yellow" },
  { status: "CONFIRMED", label: "Confirmado", icon: <Clock size={15} />, color: "blue" },
  { status: "IN_PREPARATION", label: "Em Preparo", icon: <ChefHat size={15} />, color: "orange" },
  { status: "READY", label: "Pronto", icon: <CheckCircle size={15} />, color: "green" },
];

const NEXT_STATUS: Record<string, OrderStatus> = {
  PENDING: "CONFIRMED",
  CONFIRMED: "IN_PREPARATION",
  IN_PREPARATION: "READY",
  READY: "DELIVERED",
};

const PREV_STATUS: Record<string, OrderStatus> = {
  CONFIRMED: "PENDING",
  IN_PREPARATION: "CONFIRMED",
  READY: "IN_PREPARATION",
};

const STATUS_COLORS: Record<string, string> = {
  yellow: "border-yellow-500/40 bg-yellow-500/5",
  blue: "border-blue-500/40 bg-blue-500/5",
  orange: "border-orange-500/40 bg-orange-500/5",
  green: "border-green-500/40 bg-green-500/5",
};

const BADGE_COLORS: Record<string, string> = {
  yellow: "bg-yellow-400/20 text-yellow-300",
  blue: "bg-blue-400/20 text-blue-300",
  orange: "bg-orange-400/20 text-orange-300",
  green: "bg-green-400/20 text-green-300",
};

const HEADER_COLORS: Record<string, string> = {
  yellow: "text-yellow-400",
  blue: "text-blue-400",
  orange: "text-orange-400",
  green: "text-green-400",
};

const DELIVERY_TYPE_META = {
  DELIVERY: { label: "Entrega", icon: Bike,            className: "bg-orange-400/15 text-orange-300 border-orange-400/30" },
  PICKUP:   { label: "Retirada", icon: ShoppingBag,    className: "bg-blue-400/15 text-blue-300 border-blue-400/30" },
  DINE_IN:  { label: "Mesa",     icon: UtensilsCrossed, className: "bg-purple-400/15 text-purple-300 border-purple-400/30" },
} as const;

export default function KitchenPage() {
  const { orders, loading, error, refetch, updateOrderStatus, removeOrder } = useKitchenOrders();

  async function advanceStatus(order: OrderWithItems) {
    const nextStatus = NEXT_STATUS[order.status];
    if (!nextStatus) return;

    // Optimistic: atualiza imediatamente na tela
    if (nextStatus === "DELIVERED") {
      removeOrder(order.id);
    } else {
      updateOrderStatus(order.id, nextStatus);
    }

    const res = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });

    if (res.ok) {
      toast.success(`#${order.id.slice(-6).toUpperCase()} → ${ORDER_STATUS_LABELS[nextStatus]}`);
    } else {
      // Reverte em caso de erro
      updateOrderStatus(order.id, order.status);
      toast.error("Erro ao atualizar pedido");
    }
  }

  async function revertStatus(order: OrderWithItems) {
    const prevStatus = PREV_STATUS[order.status];
    if (!prevStatus) return;

    updateOrderStatus(order.id, prevStatus);

    const res = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: prevStatus }),
    });

    if (res.ok) {
      toast.info(`#${order.id.slice(-6).toUpperCase()} ← ${ORDER_STATUS_LABELS[prevStatus]}`);
    } else {
      updateOrderStatus(order.id, order.status);
      toast.error("Erro ao reverter pedido");
    }
  }

  async function cancelOrder(order: OrderWithItems) {
    // Optimistic: remove da lista imediatamente
    removeOrder(order.id);

    const res = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    if (res.ok) {
      toast.error(`Pedido #${order.id.slice(-6).toUpperCase()} cancelado`);
    } else {
      // Reverte
      updateOrderStatus(order.id, order.status);
      toast.error("Erro ao cancelar pedido");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-neutral-500">
        <RefreshCw size={18} className="animate-spin" />
        Carregando pedidos...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-2.5">
          <AlertTriangle size={15} />
          {error}
          <button onClick={refetch} className="ml-auto underline hover:no-underline text-xs">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Kanban */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {KITCHEN_COLUMNS.map((col) => {
          const colOrders = orders.filter((o) => o.status === col.status);
          return (
            <div
              key={col.status}
              className={`rounded-xl border ${STATUS_COLORS[col.color]} flex flex-col gap-3 p-4 min-h-48`}
            >
              {/* Column header */}
              <div className="flex items-center justify-between">
                <div className={`flex items-center gap-2 font-semibold text-sm ${HEADER_COLORS[col.color]}`}>
                  {col.icon}
                  {col.label}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${BADGE_COLORS[col.color]}`}>
                  {colOrders.length}
                </span>
              </div>

              {/* Orders */}
              <div className="space-y-3">
                {colOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onAdvance={() => advanceStatus(order)}
                    onRevert={() => revertStatus(order)}
                    onCancel={() => cancelOrder(order)}
                    hasNext={!!NEXT_STATUS[order.status]}
                    hasPrev={!!PREV_STATUS[order.status]}
                  />
                ))}

                {colOrders.length === 0 && (
                  <p className="text-xs text-neutral-600 text-center py-6">
                    Nenhum pedido
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrderCard({
  order,
  onAdvance,
  onRevert,
  onCancel,
  hasNext,
  hasPrev,
}: {
  order: OrderWithItems;
  onAdvance: () => void;
  onRevert: () => void;
  onCancel: () => void;
  hasNext: boolean;
  hasPrev: boolean;
}) {
  const elapsed = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60_000);
  const deliveryMeta = DELIVERY_TYPE_META[order.deliveryType] ?? DELIVERY_TYPE_META.PICKUP;
  const DeliveryIcon = deliveryMeta.icon;

  return (
    <div className="bg-neutral-900 rounded-lg p-3 border border-neutral-800 flex flex-col gap-2">
      {/* ID + hora + tipo de entrega */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-bold text-neutral-300">
          #{order.id.slice(-6).toUpperCase()}
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${deliveryMeta.className}`}>
            <DeliveryIcon size={9} />
            {deliveryMeta.label}
          </span>
          <span className={`text-xs flex items-center gap-1 ${elapsed > 20 ? "text-red-400" : "text-neutral-500"}`}>
            <Clock size={10} />
            {elapsed}min
          </span>
        </div>
      </div>

      {/* Cliente */}
      {(order.customerName || order.user?.name) && (
        <p className="text-xs text-neutral-400 truncate">
          {order.user?.name || order.customerName}
        </p>
      )}

      {/* Itens */}
      <ul className="space-y-1">
        {order.items.map((item) => (
          <li key={item.id} className="text-sm text-white leading-snug">
            <span className="font-bold text-brand-muted">{item.quantity}×</span>{" "}
            {item.menuItem.name}
            {item.notes && (
              <p className="text-xs text-neutral-500 ml-4 italic">{item.notes}</p>
            )}
          </li>
        ))}
      </ul>

      {/* Obs do pedido */}
      {order.notes && (
        <p className="text-xs text-yellow-400 bg-yellow-400/10 rounded px-2 py-1">
          ⚠ {order.notes}
        </p>
      )}

      {/* Rodapé: valor + ações */}
      <div className="flex items-center justify-between pt-1 border-t border-neutral-800 mt-1">
        <span className="text-xs font-semibold text-neutral-400">
          {formatCurrency(order.total)}
        </span>
        <div className="flex gap-1">
          {hasPrev && (
            <button
              onClick={onRevert}
              title="Voltar fase anterior"
              className="text-xs px-2 py-1 rounded bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white transition flex items-center gap-1"
            >
              <ChevronLeft size={12} />
              Voltar
            </button>
          )}
          {order.status !== "READY" && (
            <button
              onClick={onCancel}
              className="text-xs px-2 py-1 rounded bg-neutral-800 text-neutral-400 hover:bg-red-900/60 hover:text-red-300 transition"
            >
              Cancelar
            </button>
          )}
          {hasNext && (
            <button
              onClick={onAdvance}
              className="text-xs px-2.5 py-1 rounded bg-brand hover:bg-brand-dark text-white font-semibold transition"
            >
              {order.status === "READY"
                ? order.deliveryType === "DELIVERY"
                  ? "Saiu p/ entrega"
                  : order.deliveryType === "DINE_IN"
                  ? "Servido"
                  : "Retirado"
                : "Avançar →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
