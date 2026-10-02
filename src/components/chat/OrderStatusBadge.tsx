"use client";

import { useOrderRealtime } from "@/hooks/useOrderRealtime";
import { ORDER_STATUS_LABELS } from "@/lib/utils";
import { OrderStatus } from "@/types";

const STATUS_STYLE: Record<OrderStatus, { bg: string; text: string; dot: string; emoji: string }> = {
  PENDING:          { bg: "bg-amber-50",   text: "text-amber-700",  dot: "bg-amber-400",  emoji: "🧾" },
  CONFIRMED:        { bg: "bg-blue-50",    text: "text-blue-700",   dot: "bg-blue-400",   emoji: "✅" },
  IN_PREPARATION:   { bg: "bg-orange-50",  text: "text-orange-600", dot: "bg-orange-400", emoji: "👨‍🍳" },
  READY:            { bg: "bg-green-50",   text: "text-green-700",  dot: "bg-green-500",  emoji: "📦" },
  OUT_FOR_DELIVERY: { bg: "bg-purple-50",  text: "text-purple-700", dot: "bg-purple-500", emoji: "🛵" },
  DELIVERED:        { bg: "bg-neutral-100",text: "text-neutral-600",dot: "bg-neutral-400",emoji: "🎉" },
  CANCELLED:        { bg: "bg-red-50",     text: "text-red-600",    dot: "bg-red-400",    emoji: "✕"  },
};

const ACTIVE: OrderStatus[] = ["PENDING", "CONFIRMED", "IN_PREPARATION", "READY", "OUT_FOR_DELIVERY"];

interface Props {
  orderId: string;
  initialStatus: OrderStatus;
}

export function OrderStatusBadge({ orderId, initialStatus }: Props) {
  const { status: realtimeStatus } = useOrderRealtime(orderId);
  const status = realtimeStatus ?? initialStatus;
  const s = STATUS_STYLE[status];
  const isActive = ACTIVE.includes(status);

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot} ${isActive ? "animate-pulse" : ""}`} />
      <span>{s.emoji} {ORDER_STATUS_LABELS[status]}</span>
    </span>
  );
}
