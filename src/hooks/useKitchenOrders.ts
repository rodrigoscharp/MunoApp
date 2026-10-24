"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useCanalRealtime } from "@/hooks/useTopicoRealtime";
import { OrderStatus, OrderWithItems } from "@/types";
import { aplicarAtualizacao, intervaloDaCozinha } from "@/lib/cozinha-eventos";

// Status que têm coluna no quadro. Pedido que sai deles (entregue, cancelado)
// some da tela.
const NO_QUADRO = new Set<OrderStatus>([
  "PENDING",
  "CONFIRMED",
  "IN_PREPARATION",
  "READY",
  "OUT_FOR_DELIVERY",
]);
const noQuadro = (s: OrderStatus) => NO_QUADRO.has(s);

export function useKitchenOrders() {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A lista que o tratador do canal enxerga. Decidir "preciso buscar?" dentro
  // do updater do setState não funciona: fora de um evento do React o updater
  // só roda no próximo render, depois de a decisão já ter sido tomada.
  const ordersRef = useRef<OrderWithItems[]>([]);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

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

  // Pedido novo precisa do GET: o aviso traz só o id. Mudança de pedido que já
  // está na tela é remendada no lugar (ver aplicarAtualizacao).
  const estado = useCanalRealtime("kitchen", null, {
    "order-created": () => {
      fetchOrders();
    },
    "order-updated": (payload) => {
      const r = aplicarAtualizacao(ordersRef.current, payload, noQuadro);
      ordersRef.current = r.pedidos;
      setOrders(r.pedidos);
      if (r.buscar) fetchOrders();
    },
  });
  const conectado = estado === "conectado";

  const fetchRef = useRef(fetchOrders);
  useEffect(() => {
    fetchRef.current = fetchOrders;
  });

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Polling de reserva. O ritmo segue o tempo real: esparso com o canal de pé,
  // apertado sem ele.
  //
  // Aba escondida só pausa com o canal conectado. A tela da cozinha é um
  // tablet fixo no balcão (ver src/lib/polling-visivel.ts), e sem tempo real o
  // polling é o único jeito de o pedido novo chegar e o alarme tocar; pausá-lo
  // ali seria deixar o restaurante surdo justo quando o canal caiu.
  useEffect(() => {
    const timer = setInterval(() => {
      if (conectado && typeof document !== "undefined" && document.hidden) return;
      fetchRef.current();
    }, intervaloDaCozinha(conectado));
    return () => clearInterval(timer);
  }, [conectado]);

  // Voltar para a aba ou para a rede: a tela pode estar velha, busca na hora.
  useEffect(() => {
    const aoVoltar = () => {
      if (!document.hidden) fetchRef.current();
    };
    const aoReconectar = () => fetchRef.current();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("online", aoReconectar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("online", aoReconectar);
    };
  }, []);

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

  /**
   * Devolve à lista o pedido como ele estava antes do passo otimista.
   *
   * Substitui a ressincronia por GET depois de um PATCH recusado: ela custava
   * uma ida ao servidor a cada falha e, sem rede (o caso mais comum de falha),
   * também falhava, e o card removido não voltava. O retrato guardado antes do
   * clique é a verdade que o servidor manteve, porque ele recusou a mudança.
   */
  const restoreOrder = useCallback((order: OrderWithItems) => {
    setOrders((prev) =>
      prev.some((o) => o.id === order.id)
        ? prev.map((o) => (o.id === order.id ? order : o))
        : [...prev, order].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )
    );
  }, []);

  return {
    orders,
    loading,
    error,
    estado,
    refetch: fetchOrders,
    updateOrderStatus,
    removeOrder,
    restoreOrder,
  };
}
