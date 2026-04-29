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
} from "lucide-react";
import { useOrderNotifications, OrderNotification } from "@/hooks/useOrderNotifications";
import { OrderStatus } from "@/types";

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
  const meta = STATUS_META[notification.status] ?? {
    icon: Bell,
    color: "text-neutral-500",
    bg: "bg-neutral-50",
  };
  const Icon = meta.icon;

  return (
    <Link
      href={`/track/${notification.orderId}`}
      onClick={() => onRead(notification.id)}
      className={`flex items-start gap-3 px-4 py-3 hover:bg-neutral-50 transition ${
        !notification.read ? "bg-brand-light/40" : ""
      }`}
    >
      <span className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${meta.bg}`}>
        <Icon size={15} className={meta.color} />
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${!notification.read ? "font-semibold text-neutral-900" : "font-medium text-neutral-700"}`}>
          {notification.message}
        </p>
        {notification.description && (
          <p className="text-xs text-neutral-500 mt-0.5 leading-snug">
            {notification.description}
          </p>
        )}
        <p className="text-xs text-neutral-400 mt-1">
          {timeAgo(notification.timestamp)}
        </p>
      </div>
      {!notification.read && (
        <span className="mt-2 flex-shrink-0 w-2 h-2 rounded-full bg-brand" />
      )}
    </Link>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllAsRead, markAsRead, clearAll } =
    useOrderNotifications();
  const [open, setOpen] = useState(false);
  const [bellRing, setBellRing] = useState(false);
  const [badgeBounce, setBadgeBounce] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevUnread = useRef(unreadCount);

  // Anima o sino e o badge quando chega nova notificação
  useEffect(() => {
    if (unreadCount > prevUnread.current) {
      setBellRing(true);
      setBadgeBounce(true);
      const t1 = setTimeout(() => setBellRing(false), 700);
      const t2 = setTimeout(() => setBadgeBounce(false), 400);
      prevUnread.current = unreadCount;
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    prevUnread.current = unreadCount;
  }, [unreadCount]);

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
        className="relative flex items-center justify-center w-10 h-10 rounded-full hover:bg-neutral-100 transition"
        aria-label="Notificações de pedido"
      >
        <Bell
          size={20}
          className={`text-neutral-700 ${bellRing ? "animate-bell-ring" : ""}`}
        />
        {unreadCount > 0 && (
          <span
            key={unreadCount}
            className={`absolute -top-0.5 -right-0.5 bg-brand text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold leading-none ${badgeBounce ? "animate-cart-bounce" : ""}`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-neutral-200 rounded-2xl shadow-xl overflow-hidden z-50">
          {/* Header do painel */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
            <span className="text-sm font-semibold text-neutral-800">Notificações</span>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 text-xs text-neutral-400 hover:text-red-500 transition"
              >
                <Trash2 size={12} /> Limpar
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="max-h-80 overflow-y-auto divide-y divide-neutral-100">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-neutral-400">
                <Bell size={32} className="mb-2 opacity-30" />
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
            <div className="border-t border-neutral-100 px-4 py-2.5">
              <Link
                href="/pedidos"
                onClick={() => setOpen(false)}
                className="block text-center text-xs font-medium text-brand hover:underline"
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
