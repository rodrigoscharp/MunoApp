"use client";

import { useOrderRealtime } from "@/hooks/useOrderRealtime";
import { ORDER_STATUS_LABELS } from "@/lib/utils";
import { OrderStatus } from "@/types";
import { SELO_DO_PEDIDO, seloBase } from "@/components/loja/selo-do-pedido";

const ACTIVE: OrderStatus[] = ["PENDING", "CONFIRMED", "IN_PREPARATION", "READY", "OUT_FOR_DELIVERY"];

interface Props {
  orderId: string;
  initialStatus: OrderStatus;
}

export function OrderStatusBadge({ orderId, initialStatus }: Props) {
  const { status: realtimeStatus } = useOrderRealtime(orderId);
  const status = realtimeStatus ?? initialStatus;
  const isActive = ACTIVE.includes(status);

  // As cores são as mesmas do selo em "Meus pedidos" (selo-do-pedido.ts). O
  // ponto pulsa enquanto o pedido anda e herda a cor do texto.
  return (
    <span className={`${seloBase} shrink-0 ${SELO_DO_PEDIDO[status]}`}>
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${isActive ? "animate-pulse" : ""}`}
      />
      <span>{ORDER_STATUS_LABELS[status]}</span>
    </span>
  );
}
