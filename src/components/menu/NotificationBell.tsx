"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Bell,
  Clock,
  CheckCircle,
  UtensilsCrossed,
  Package,
  Bike,
  PackageCheck,
  XCircle,
  Trash2,
  MessageSquare,
} from "lucide-react";
import { useOrderNotifications, OrderNotification } from "@/hooks/useOrderNotifications";
import { OrderStatus } from "@/types";
import { useAnimacaoAoMudar } from "@/hooks/useAnimacaoAoMudar";

const STATUS_META: Record<
  OrderStatus,
  { icon: React.ElementType; color: string; bg: string }
> = {
  PENDING:          { icon: Clock,           color: "text-yellow-500", bg: "bg-yellow-50" },
  CONFIRMED:        { icon: CheckCircle,     color: "text-blue-500",   bg: "bg-blue-50"   },
  IN_PREPARATION:   { icon: UtensilsCrossed, color: "text-orange-500", bg: "bg-orange-50" },
  READY:            { icon: Package,         color: "text-green-500",  bg: "bg-green-50"  },
  OUT_FOR_DELIVERY: { icon: Bike,            color: "text-blue-600",   bg: "bg-blue-50"   },
  DELIVERED:        { icon: PackageCheck,    color: "text-green-600",  bg: "bg-green-50"  },
  CANCELLED:        { icon: XCircle,         color: "text-red-500",    bg: "bg-red-50"    },
};

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

function NotificationItem({
  notification,
  onRead,
}: {
  notification: OrderNotification;
  onRead: (id: string) => void;
}) {
  const isChat = notification.type === "chat";

  const meta = isChat
    ? { icon: MessageSquare, color: "text-brand", bg: "bg-brand/10" }
    : STATUS_META[notification.status] ?? { icon: Bell, color: "text-neutral-500", bg: "bg-neutral-50" };

  const Icon = meta.icon;
  const href = isChat
    ? `/pedidos/${notification.orderId}/chat`
    : `/track/${notification.orderId}`;

  return (
    <Link
      href={href}
      onClick={() => onRead(notification.id)}
      className={`flex items-start gap-3 px-4 py-3 hover:bg-loja-pessego-claro/60 transition ${
        !notification.read ? "bg-loja-pessego-claro" : ""
      }`}
    >
      <span className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${meta.bg}`}>
        <Icon size={15} aria-hidden="true" className={meta.color} />
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${!notification.read ? "font-semibold text-loja-tinta" : "font-medium text-loja-tinta-2"}`}>
          {notification.message}
        </p>
        {notification.description && (
          <p className="text-xs text-loja-tinta-2 mt-0.5 leading-snug truncate">
            {notification.description}
          </p>
        )}
        <p className="text-xs text-loja-tinta-2 mt-1">
          {timeAgo(notification.timestamp)}
        </p>
      </div>
      {!notification.read && (
        <span aria-hidden="true" className="mt-2 flex-shrink-0 w-2 h-2 rounded-full bg-brand" />
      )}
    </Link>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllAsRead, markAsRead, clearAll } =
    useOrderNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Uma chave só para os dois elementos: o sino e o badge tocam juntos quando
  // chega notificação nova. Marcar como lida faz a contagem cair, e cair não
  // é chegada — daí `apenasAoCrescer`.
  const avisoKey = useAnimacaoAoMudar(unreadCount, { apenasAoCrescer: true });

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = useCallback(() => {
    setOpen((v) => !v);
    if (!open && unreadCount > 0) {
      markAllAsRead();
    }
  }, [open, unreadCount, markAllAsRead]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        type="button"
        aria-expanded={open}
        className="relative flex items-center justify-center w-11 h-11 rounded-full bg-loja-papel shadow-loja hover:bg-white transition"
        aria-label="Notificações de pedido"
      >
        <Bell
          key={avisoKey}
          size={20}
          aria-hidden="true"
          className={`text-loja-tinta ${avisoKey > 0 ? "animate-bell-ring" : ""}`}
        />
        {unreadCount > 0 && (
          <span
            key={avisoKey}
            className={`absolute -top-0.5 -right-0.5 bg-loja-brasa text-white text-xs rounded-full min-w-5 h-5 px-1 flex items-center justify-center font-extrabold leading-none ring-2 ring-loja-papel ${avisoKey > 0 ? "animate-cart-bounce" : ""}`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-2rem))] bg-loja-papel rounded-[20px] shadow-loja-alta overflow-hidden z-50">
          {/* Header do painel */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-loja-linha">
            <span className="text-sm font-extrabold text-loja-tinta">Notificações</span>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                type="button"
                className="flex items-center gap-1 min-h-8 px-1 text-xs font-semibold text-loja-tinta-2 hover:text-red-700 transition"
              >
                <Trash2 size={12} aria-hidden="true" /> Limpar
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="max-h-80 overflow-y-auto divide-y divide-loja-linha">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-6 text-center text-loja-tinta-2">
                <Bell size={32} aria-hidden="true" className="mb-2 opacity-30" />
                <p className="text-sm">Nenhuma notificação ainda</p>
                <p className="text-xs mt-1">As atualizações dos seus pedidos aparecerão aqui</p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onRead={(id) => { markAsRead(id); setOpen(false); }}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-loja-linha px-4 py-2.5">
              <Link
                href="/pedidos"
                onClick={() => setOpen(false)}
                className="block text-center text-xs font-bold text-loja-preco hover:underline"
              >
                Ver todos os pedidos
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
