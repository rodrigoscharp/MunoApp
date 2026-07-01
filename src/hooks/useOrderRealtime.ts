"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { tenantChannelName } from "@/lib/realtime-channel";
import { OrderStatus } from "@/types";
import { ORDER_STATUS_LABELS } from "@/lib/utils";
import { toast } from "sonner";

export function useOrderRealtime(orderId: string, tenantId: string) {
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [estimatedDeliveryAt, setEstimatedDeliveryAt] = useState<Date | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(tenantChannelName(tenantId, `order:${orderId}`))
      .on("broadcast", { event: "order-updated" }, ({ payload }) => {
        const newStatus = payload.status as OrderStatus;
        setStatus(newStatus);
        setUpdatedAt(payload.updatedAt as string);

        if (payload.estimatedDeliveryAt) {
          setEstimatedDeliveryAt(new Date(payload.estimatedDeliveryAt as string));
        }

        toast.info(`Pedido atualizado: ${ORDER_STATUS_LABELS[newStatus]}`);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, tenantId]);

  return { status, updatedAt, estimatedDeliveryAt };
}
