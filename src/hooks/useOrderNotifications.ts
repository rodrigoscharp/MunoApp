"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { DeliveryType, OrderStatus, OrderWithItems } from "@/types";

export interface OrderNotification {
  id: string;
  orderId: string;
  status: OrderStatus;
  /** Mensagem principal exibida no sino */
  message: string;
  /** Subtítulo curto exibido no toast */
  description: string;
  timestamp: string;
  read: boolean;
}

const STORAGE_KEY = "muno-order-notifications";
const MAX_NOTIFICATIONS = 20;
const POLL_INTERVAL = 15_000;

// Mensagens com contexto de deliveryType
function buildMessages(
  status: OrderStatus,
  deliveryType: DeliveryType
): { message: string; description: string; toastTitle: string } {
  switch (status) {
    case "PENDING":
      return {
        toastTitle: "Pedido recebido!",
        message: "Recebemos seu pedido!",
        description: "Aguardando confirmação da cozinha...",
      };
    case "CONFIRMED":
      return {
        toastTitle: "Pedido confirmado!",
        message: "Pedido confirmado pela cozinha!",
        description: "Já estamos separando tudo para você",
      };
    case "IN_PREPARATION":
      return {
        toastTitle: "Preparando seu pedido...",
        message: "Seu pedido está sendo preparado!",
        description: "A cozinha está trabalhando com carinho",
      };
    case "READY":
      if (deliveryType === "DELIVERY") {
        return {
          toastTitle: "Pronto! O motoboy está saindo",
          message: "Seu pedido saiu para entrega!",
          description: "Acompanhe o motoboy em tempo real",
        };
      }
      if (deliveryType === "DINE_IN") {
        return {
          toastTitle: "Pedido pronto! A caminho da mesa",
          message: "Seu pedido está a caminho da mesa!",
          description: "Já já chega até você",
        };
      }
      return {
        toastTitle: "Pronto para retirada!",
        message: "Seu pedido está pronto para retirada!",
        description: "Pode vir buscar quando quiser",
      };
    case "OUT_FOR_DELIVERY":
      return {
        toastTitle: "O motoboy saiu!",
        message: "O motoboy está a caminho!",
        description: "Acompanhe a entrega em tempo real",
      };
    case "DELIVERED":
      return {
        toastTitle: "Pedido entregue!",
        message: "Pedido entregue com sucesso!",
        description: "Bom apetite! Obrigado pela preferência",
      };
    case "CANCELLED":
      return {
        toastTitle: "Pedido cancelado",
        message: "Seu pedido foi cancelado",
        description: "Entre em contato caso precise de ajuda",
      };
    default:
      return {
        toastTitle: "Pedido atualizado",
        message: "Seu pedido foi atualizado",
        description: "Confira o status pelo sino",
      };
  }
}

function loadFromStorage(): OrderNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OrderNotification[]) : [];
  } catch {
    return [];
  }
}

function saveToStorage(notifications: OrderNotification[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
}

type OrderMeta = { status: OrderStatus; deliveryType: DeliveryType };

export function useOrderNotifications() {
  const { data: session } = useSession();
  const [notifications, setNotifications] = useState<OrderNotification[]>(loadFromStorage);
  const userId = session?.user?.id;

  // Mapa orderId → { status, deliveryType } dos pedidos do usuário
  const knownOrders = useRef<Map<string, OrderMeta>>(new Map());

  const addNotification = useCallback(
    (orderId: string, status: OrderStatus, deliveryType: DeliveryType) => {
      const { message, description, toastTitle } = buildMessages(status, deliveryType);

      const notification: OrderNotification = {
        id: `${orderId}-${status}-${Date.now()}`,
        orderId,
        status,
        message,
        description,
        timestamp: new Date().toISOString(),
        read: false,
      };

      setNotifications((prev) => {
        const exists = prev.some((n) => n.orderId === orderId && n.status === status);
        if (exists) return prev;
        const updated = [notification, ...prev].slice(0, MAX_NOTIFICATIONS);
        saveToStorage(updated);
        return updated;
      });

      const isCancelled = status === "CANCELLED";
      const isDelivered = status === "DELIVERED";

      toast[isCancelled ? "error" : isDelivered ? "success" : "info"](toastTitle, {
        description,
        duration: 6000,
      });
    },
    []
  );

  useEffect(() => {
    if (!userId) return;

    async function fetchAndCompare() {
      try {
        const res = await fetch("/api/orders");
        if (!res.ok) return;
        const orders: OrderWithItems[] = await res.json();

        for (const order of orders) {
          const prev = knownOrders.current.get(order.id);
          if (prev !== undefined && prev.status !== order.status) {
            addNotification(order.id, order.status, order.deliveryType);
          }
          knownOrders.current.set(order.id, {
            status: order.status,
            deliveryType: order.deliveryType,
          });
        }
      } catch {}
    }

    async function initStatuses() {
      try {
        const res = await fetch("/api/orders");
        if (!res.ok) return;
        const orders: OrderWithItems[] = await res.json();
        orders.forEach((o) =>
          knownOrders.current.set(o.id, {
            status: o.status,
            deliveryType: o.deliveryType,
          })
        );
      } catch {}
    }

    initStatuses();

    const channel = supabase
      .channel(`order-notif-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "Order" },
        (payload) => {
          const row = payload.new as { id: string; status: OrderStatus; deliveryType?: DeliveryType };
          const prev = knownOrders.current.get(row.id);
          if (prev === undefined) return; // pedido de outro usuário
          if (row.status === prev.status) return;
          const deliveryType = row.deliveryType ?? prev.deliveryType;
          knownOrders.current.set(row.id, { status: row.status, deliveryType });
          addNotification(row.id, row.status, deliveryType);
        }
      )
      .subscribe();

    const poll = setInterval(fetchAndCompare, POLL_INTERVAL);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [userId, addNotification]);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    saveToStorage([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, markAllAsRead, markAsRead, clearAll };
}
