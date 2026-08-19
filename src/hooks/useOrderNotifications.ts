"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { tenantChannelName, userChannel } from "@/lib/realtime-channel";
import { DeliveryType, OrderStatus } from "@/types";

export interface OrderNotification {
  id: string;
  orderId: string;
  type: "status" | "chat";
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
// Rede de segurança, não a fonte principal — o Broadcast em user:<id> é quem
// entrega a mudança na hora. Cada disparo aqui são duas requisições (pedidos +
// chat não lido) por cliente com o cardápio aberto: a 15s, era o maior gerador
// de carga do sistema inteiro.
const POLL_INTERVAL = 60_000;

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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch {
    // `setItem` lança com a cota estourada e no modo privado do Safari, onde a
    // API existe e recusa escrita. A leitura já era protegida; a escrita não
    // era, e a exceção subia de dentro de um setState — derrubando o sino, e
    // com ele o cardápio, por não conseguir gravar um histórico que é
    // conveniência. Perder a persistência é aceitável; perder a tela não.
  }
}

type OrderMeta = { status: OrderStatus; deliveryType: DeliveryType };

/**
 * O que GET /api/orders devolve para o cliente. Só estes três campos — o
 * endpoint deixou de mandar itens e menuItem justamente porque este hook, seu
 * único consumidor, nunca olhou para eles.
 */
type OrderResumo = { id: string } & OrderMeta;

export function useOrderNotifications() {
  const { data: session } = useSession();
  const [notifications, setNotifications] = useState<OrderNotification[]>(loadFromStorage);
  const userId = session?.user?.id;
  // tenantId é opcional no tipo Session (a de plataforma não tem um), mas todo
  // cliente logado num restaurante tem — é o que nomeia o canal do Broadcast.
  const tenantId = session?.user?.tenantId;

  // Mapa orderId → { status, deliveryType } dos pedidos do usuário
  const knownOrders = useRef<Map<string, OrderMeta>>(new Map());

  const addNotification = useCallback(
    (orderId: string, status: OrderStatus, deliveryType: DeliveryType) => {
      const { message, description, toastTitle } = buildMessages(status, deliveryType);

      const notification: OrderNotification = {
        id: `${orderId}-${status}-${Date.now()}`,
        orderId,
        type: "status",
        status,
        message,
        description,
        timestamp: new Date().toISOString(),
        read: false,
      };

      setNotifications((prev) => {
        const exists = prev.some((n) => n.orderId === orderId && n.status === status && n.type === "status");
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

  const addChatNotification = useCallback(
    (msgId: string, orderId: string, content: string, timestamp: string) => {
      const notification: OrderNotification = {
        id: `chat-${msgId}`,
        orderId,
        type: "chat",
        status: "CONFIRMED", // campo obrigatório no type, não usado para chat
        message: "Mensagem do restaurante",
        description: content.length > 60 ? content.slice(0, 57) + "…" : content,
        timestamp,
        read: false,
      };

      setNotifications((prev) => {
        if (prev.some((n) => n.id === notification.id)) return prev;
        const updated = [notification, ...prev].slice(0, MAX_NOTIFICATIONS);
        saveToStorage(updated);
        return updated;
      });

      toast.info("💬 Mensagem do restaurante", {
        description: notification.description,
        duration: 7000,
        action: {
          label: "Ver chat",
          onClick: () => { window.location.href = `/pedidos/${orderId}/chat`; },
        },
      });
    },
    []
  );

  useEffect(() => {
    if (!userId || !tenantId) return;

    // Timestamp da última mensagem de chat vista — inicia com "agora" para não
    // notificar mensagens históricas ao abrir o app
    const lastChatCheck = { current: new Date().toISOString() };

    async function fetchChatMessages() {
      try {
        const res = await fetch(`/api/chat/unread?since=${encodeURIComponent(lastChatCheck.current)}`);
        if (!res.ok) return;
        const msgs: { id: string; orderId: string; content: string; createdAt: string }[] = await res.json();
        if (msgs.length === 0) return;
        // Avança o cursor para a mensagem mais recente
        lastChatCheck.current = msgs[msgs.length - 1].createdAt;
        for (const msg of msgs) {
          addChatNotification(msg.id, msg.orderId, msg.content, msg.createdAt);
        }
      } catch {}
    }

    async function fetchAndCompare() {
      try {
        const res = await fetch("/api/orders");
        if (!res.ok) return;
        const orders: OrderResumo[] = await res.json();

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
        const orders: OrderResumo[] = await res.json();
        orders.forEach((o) =>
          knownOrders.current.set(o.id, {
            status: o.status,
            deliveryType: o.deliveryType,
          })
        );
      } catch {}
    }

    initStatuses();

    // Canal do próprio cliente. A versão anterior assinava postgres_changes na
    // tabela Order inteira e filtrava no navegador — o que, além do fan-out,
    // nunca chegou a disparar: Order tem RLS e a policy bloqueia a role anon
    // por inteiro (app.current_tenant não é definido). Na prática o sino vivia
    // só do polling. Agora o servidor publica direto em user:<id>.
    const channel = supabase
      .channel(tenantChannelName(tenantId, userChannel(userId)))
      .on("broadcast", { event: "order-updated" }, ({ payload }) => {
        const orderId = payload.orderId as string;
        const status = payload.status as OrderStatus;
        const prev = knownOrders.current.get(orderId);

        // Pedido ainda desconhecido: registra sem notificar, mesma regra do
        // polling — não se avisa sobre um pedido que o cliente acabou de criar.
        if (prev === undefined) {
          knownOrders.current.set(orderId, {
            status,
            deliveryType: payload.deliveryType as DeliveryType,
          });
          return;
        }

        if (status === prev.status) return;
        const deliveryType = (payload.deliveryType as DeliveryType) ?? prev.deliveryType;
        knownOrders.current.set(orderId, { status, deliveryType });
        addNotification(orderId, status, deliveryType);
      })
      .on("broadcast", { event: "chat-message" }, ({ payload }) => {
        // Mensagem do próprio cliente não vira notificação para ele.
        if (payload.senderRole === "CUSTOMER") return;
        fetchChatMessages();
      })
      .subscribe();

    const poll = setInterval(fetchAndCompare, POLL_INTERVAL);
    const chatPoll = setInterval(fetchChatMessages, POLL_INTERVAL);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      clearInterval(chatPoll);
    };
  }, [userId, tenantId, addNotification, addChatNotification]);

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
