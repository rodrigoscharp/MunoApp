"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { tenantChannelName } from "@/lib/realtime-channel";
import { OrderWithItems } from "@/types";

const POLL_INTERVAL = 30_000; // fallback polling a cada 30s

export function useKitchenOrders(tenantId: string) {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const realtimeActive = useRef(false);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders?kitchen=true");
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
        setError(null);
      } else {
        setError("Erro ao carregar pedidos");
      }
    } catch {
      setError("Sem conexão com o servidor");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();

    // Tenta Realtime — se falhar, polling assume
    const channel = supabase
      .channel(tenantChannelName(tenantId, "kitchen-orders"))
      .on("broadcast", { event: "order-created" }, () => fetchOrders())
      .on("broadcast", { event: "order-updated" }, () => fetchOrders())
      .subscribe((status) => {
        realtimeActive.current = status === "SUBSCRIBED";
      });

    // Polling de segurança: atualiza a cada 30s independente do Realtime
    const poll = setInterval(() => {
      fetchOrders();
    }, POLL_INTERVAL);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [fetchOrders, tenantId]);

  // Atualiza o status localmente de imediato (optimistic update)
  const updateOrderStatus = useCallback((orderId: string, newStatus: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, status: newStatus as OrderWithItems["status"] } : o
      )
    );
  }, []);

  // Remove um pedido da lista localmente (ex: DELIVERED/CANCELLED)
  const removeOrder = useCallback((orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  }, []);

  return { orders, loading, error, refetch: fetchOrders, updateOrderStatus, removeOrder };
}
