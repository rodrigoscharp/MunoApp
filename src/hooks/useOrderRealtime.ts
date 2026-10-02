"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useTopicoRealtime } from "@/hooks/useTopicoRealtime";
import { OrderStatus } from "@/types";
import { ORDER_STATUS_LABELS } from "@/lib/utils";
import { toast } from "sonner";

export function useOrderRealtime(orderId: string) {
  const topic = useTopicoRealtime("order", orderId);
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [estimatedDeliveryAt, setEstimatedDeliveryAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!topic) return;
    const channel = supabase
      .channel(topic)
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
  }, [topic]);

  return { status, updatedAt, estimatedDeliveryAt };
}
