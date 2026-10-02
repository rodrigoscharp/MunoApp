"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTopicoRealtime } from "@/hooks/useTopicoRealtime";
import { OrderWithItems } from "@/types";

const POLL_INTERVAL = 30_000; // fallback polling a cada 30s

export function useKitchenOrders() {
  const topic = useTopicoRealtime("kitchen");
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Tenta Realtime — se falhar (ou o tópico não vier), o polling assume.
  useEffect(() => {
    if (!topic) return;
    const channel = supabase
      .channel(topic)
      .on("broadcast", { event: "order-created" }, () => fetchOrders())
      .on("broadcast", { event: "order-updated" }, () => fetchOrders())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [topic, fetchOrders]);

  useEffect(() => {
    fetchOrders();

    // Polling de segurança: atualiza a cada 30s independente do Realtime.
    // Um `realtimeActive` guardado em ref chegou a ser escrito aqui e nunca foi
    // lido em lugar nenhum — a intenção de pular o polling com o Realtime de pé
    // nunca saiu do papel, e o ref só sugeria uma condição que não existia.
    const poll = setInterval(() => {
      fetchOrders();
    }, POLL_INTERVAL);

    return () => {
      clearInterval(poll);
    };
  }, [fetchOrders]);

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
