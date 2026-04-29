"use client";

import { useOrderRealtime } from "@/hooks/useOrderRealtime";
import { formatCurrency, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/utils";
import { OrderStatus, PaymentMethod, PaymentStatus } from "@/types";
import { LiveDeliveryTracker } from "@/components/delivery/LiveDeliveryTracker";
import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface OrderSummary {
  id: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  total: number;
  createdAt: Date;
  estimatedDeliveryAt?: Date | null;
  deliveryAddress?: string | null;
  deliveryType?: string;
  initialLat?: number | null;
  initialLng?: number | null;
  items: {
    id: string;
    quantity: number;
    unitPrice: number;
    notes: string | null;
    menuItem: { id: string; name: string; imageUrl: string | null };
  }[];
}

interface Props {
  orderId: string;
  initialStatus: OrderStatus;
  order: OrderSummary;
}

// ─── Configuração dos status ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  OrderStatus,
  { emoji: string; title: string; message: string; color: string; bg: string; ring: string }
> = {
  PENDING: {
    emoji: "🧾",
    title: "Pedido recebido",
    message: "Aguardando confirmação do restaurante",
    color: "text-amber-600",
    bg: "bg-amber-50",
    ring: "ring-amber-200",
  },
  CONFIRMED: {
    emoji: "✅",
    title: "Pedido confirmado",
    message: "O restaurante confirmou seu pedido",
    color: "text-blue-600",
    bg: "bg-blue-50",
    ring: "ring-blue-200",
  },
  IN_PREPARATION: {
    emoji: "👨‍🍳",
    title: "Em preparo",
    message: "Nossa cozinha está preparando tudo com cuidado",
    color: "text-orange-500",
    bg: "bg-orange-50",
    ring: "ring-orange-200",
  },
  READY: {
    emoji: "📦",
    title: "Pronto!",
    message: "Pedido embalado e pronto para retirada",
    color: "text-green-600",
    bg: "bg-green-50",
    ring: "ring-green-200",
  },
  OUT_FOR_DELIVERY: {
    emoji: "🛵",
    title: "A caminho!",
    message: "Seu pedido está saindo para entrega agora",
    color: "text-brand",
    bg: "bg-red-50",
    ring: "ring-red-200",
  },
  DELIVERED: {
    emoji: "🎉",
    title: "Entregue!",
    message: "Bom apetite! Esperamos que aproveite",
    color: "text-green-600",
    bg: "bg-green-50",
    ring: "ring-green-200",
  },
  CANCELLED: {
    emoji: "✕",
    title: "Cancelado",
    message: "Este pedido foi cancelado",
    color: "text-neutral-500",
    bg: "bg-neutral-100",
    ring: "ring-neutral-200",
  },
};

const STEPS: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "IN_PREPARATION",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

const STEP_LABELS: Record<OrderStatus, string> = {
  PENDING: "Recebido",
  CONFIRMED: "Confirmado",
  IN_PREPARATION: "Preparando",
  READY: "Pronto",
  OUT_FOR_DELIVERY: "Em entrega",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
};

// ─── Componente ETA ────────────────────────────────────────────────────────────

function EtaDisplay({
  estimatedDeliveryAt,
  isRouteEta,
}: {
  estimatedDeliveryAt: Date;
  isRouteEta: boolean;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const calc = () =>
      setRemaining(Math.round((estimatedDeliveryAt.getTime() - Date.now()) / 60_000));
    calc();
    const t = setInterval(calc, 30_000);
    return () => clearInterval(t);
  }, [estimatedDeliveryAt]);

  const timeStr = estimatedDeliveryAt.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (remaining === null) return null;

  return (
    <div className="mt-5 flex items-center justify-between bg-white/60 backdrop-blur-sm rounded-2xl px-4 py-3 border border-white/80">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
          {isRouteEta ? "Chegada estimada · por rota" : "Previsão de entrega"}
        </p>
        <p className="text-2xl font-black text-neutral-900 mt-0.5 tabular-nums">{timeStr}</p>
      </div>
      {remaining > 0 && (
        <div className="text-right">
          <p className="text-3xl font-black text-brand tabular-nums leading-none">{remaining}</p>
          <p className="text-[11px] text-neutral-700 font-medium mt-0.5">minutos</p>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export function OrderTracker({ orderId, initialStatus, order }: Props) {
  const { status: realtimeStatus, estimatedDeliveryAt: realtimeEta } =
    useOrderRealtime(orderId);
  const currentStatus = realtimeStatus ?? initialStatus;

  const estimatedDeliveryAt =
    realtimeEta ??
    (order.estimatedDeliveryAt ? new Date(order.estimatedDeliveryAt) : null);

  const isCancelled = currentStatus === "CANCELLED";
  const isDelivered = currentStatus === "DELIVERED";
  const isOutForDelivery = currentStatus === "OUT_FOR_DELIVERY";
  const currentIndex = STEPS.indexOf(currentStatus);
  const cfg = STATUS_CONFIG[currentStatus];

  // Pulsa o ícone quando o status muda
  const [pulse, setPulse] = useState(false);
  const prevStatus = useRef(currentStatus);
  useEffect(() => {
    if (currentStatus !== prevStatus.current) {
      prevStatus.current = currentStatus;
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 800);
      return () => clearTimeout(t);
    }
  }, [currentStatus]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap');
        .tracker-root { font-family: 'Outfit', sans-serif; }
        @keyframes status-pop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.18); }
          70%  { transform: scale(0.94); }
          100% { transform: scale(1); }
        }
        @keyframes fade-slide-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dot-ping {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.6); opacity: 0; }
        }
        .status-pop { animation: status-pop 0.5s cubic-bezier(.36,.07,.19,.97); }
        .fade-in    { animation: fade-slide-up 0.4s ease both; }
        .dot-ping   { animation: dot-ping 1.5s ease-in-out infinite; }
      `}</style>

      <div className="tracker-root space-y-3">

        {/* ── Hero do status ─────────────────────────────────────────────── */}
        <div
          className={`rounded-3xl p-6 transition-all duration-500 ${
            isCancelled
              ? "bg-neutral-100 border border-neutral-200"
              : "bg-neutral-950 text-white"
          }`}
        >
          {/* Ícone + live badge */}
          <div className="flex items-start justify-between mb-4">
            <div
              className={`relative w-16 h-16 rounded-2xl flex items-center justify-center text-3xl
                ${isCancelled ? "bg-neutral-200" : "bg-white/10"}
                ${pulse ? "status-pop" : ""}
              `}
            >
              {cfg.emoji}
              {/* Ping ao vivo — só nos status ativos */}
              {!isCancelled && !isDelivered && (
                <span className="absolute -top-1 -right-1 w-3 h-3">
                  <span className="dot-ping absolute inset-0 rounded-full bg-brand opacity-75" />
                  <span className="relative block w-3 h-3 rounded-full bg-brand" />
                </span>
              )}
            </div>

            {!isCancelled && !isDelivered && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-white/50 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse inline-block" />
                Ao vivo
              </span>
            )}
          </div>

          {/* Título e mensagem */}
          <p
            className={`text-[11px] font-semibold uppercase tracking-widest mb-1 ${
              isCancelled ? "text-neutral-400" : "text-white/40"
            }`}
          >
            Pedido #{orderId.slice(-6).toUpperCase()}
          </p>
          <h2
            key={currentStatus}
            className={`text-2xl font-black leading-tight fade-in ${
              isCancelled ? "text-neutral-500" : "text-white"
            }`}
          >
            {cfg.title}
          </h2>
          <p
            className={`text-sm mt-1 leading-relaxed ${
              isCancelled ? "text-neutral-400" : "text-white/60"
            }`}
          >
            {cfg.message}
          </p>

          {/* ETA */}
          {estimatedDeliveryAt && !isDelivered && !isCancelled && (
            <EtaDisplay
              estimatedDeliveryAt={estimatedDeliveryAt}
              isRouteEta={isOutForDelivery && !!realtimeEta}
            />
          )}
        </div>

        {/* ── Timeline vertical ──────────────────────────────────────────── */}
        {!isCancelled && (
          <div className="bg-white rounded-3xl border border-neutral-100 px-5 py-5">
            <div className="relative">
              <div className="space-y-0">
                {STEPS.map((step, i) => {
                  const isCompleted = i < currentIndex;
                  const isCurrent = i === currentIndex;
                  const isFuture = i > currentIndex;
                  const isLast = i === STEPS.length - 1;

                  return (
                    <div key={step} className="flex items-center gap-4 py-2.5 relative">
                      {/* Conector para o próximo passo — não renderiza no último */}
                      {!isLast && (
                        <div
                          className={`absolute left-[19px] top-[50px] bottom-[-30px] w-px z-0 transition-colors duration-700 ${
                            i < currentIndex ? "bg-brand" : "bg-neutral-100"
                          }`}
                        />
                      )}

                      {/* Dot */}
                      <div className="relative z-10 flex-shrink-0">
                        {isCompleted ? (
                          <div className="w-10 h-10 rounded-full bg-brand flex items-center justify-center">
                            <svg
                              className="w-4 h-4 text-white"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </div>
                        ) : isCurrent ? (
                          <div className="w-10 h-10 rounded-full bg-white border-2 border-brand flex items-center justify-center shadow-md shadow-red-100">
                            <span className="text-lg">{STATUS_CONFIG[step].emoji}</span>
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-neutral-50 border border-neutral-200 flex items-center justify-center">
                            <span className="text-lg opacity-30">{STATUS_CONFIG[step].emoji}</span>
                          </div>
                        )}
                      </div>

                      {/* Label */}
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-semibold leading-none ${
                            isCompleted
                              ? "text-neutral-400 line-through"
                              : isCurrent
                              ? "text-neutral-900"
                              : "text-neutral-300"
                          }`}
                        >
                          {STEP_LABELS[step]}
                        </p>
                        {isCurrent && (
                          <p className="text-xs text-brand font-medium mt-0.5">
                            Status atual
                          </p>
                        )}
                      </div>

                      {/* Checkmark para completados */}
                      {isCompleted && (
                        <span className="text-xs text-neutral-300 font-medium">✓</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Mapa ao vivo ───────────────────────────────────────────────── */}
        {isOutForDelivery &&
          order.deliveryType === "DELIVERY" &&
          order.deliveryAddress && (
            <LiveDeliveryTracker
              orderId={orderId}
              deliveryAddress={order.deliveryAddress}
              initialLat={order.initialLat}
              initialLng={order.initialLng}
            />
          )}

        {/* ── Itens do pedido ────────────────────────────────────────────── */}
        <div className="bg-white rounded-3xl border border-neutral-100 overflow-hidden">
          <div className="px-5 pt-5 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-4">
              Itens do pedido
            </p>
            <ul className="space-y-3">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-lg bg-red-50 text-brand text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                    {item.quantity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-800 leading-snug">
                      {item.menuItem.name}
                    </p>
                    {item.notes && (
                      <p className="text-xs text-neutral-400 mt-0.5 italic">{item.notes}</p>
                    )}
                  </div>
                  <span className="text-sm text-neutral-500 font-medium flex-shrink-0">
                    {formatCurrency(item.unitPrice * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Total */}
          <div className="mx-5 my-4 pt-4 border-t border-neutral-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-500">
                {PAYMENT_METHOD_LABELS[order.paymentMethod]}
              </span>
              {order.paymentStatus === "PAID" && (
                <span className="text-xs bg-green-50 text-green-600 font-semibold px-2 py-0.5 rounded-full">
                  Pago ✓
                </span>
              )}
            </div>
            <span className="text-xl font-black text-neutral-900">
              {formatCurrency(order.total)}
            </span>
          </div>
        </div>

        {/* ── Entregue ───────────────────────────────────────────────────── */}
        {isDelivered && (
          <div className="bg-green-50 rounded-3xl border border-green-100 px-5 py-5 text-center">
            <p className="text-3xl mb-2">🎉</p>
            <p className="font-black text-green-700 text-lg">Bom apetite!</p>
            <p className="text-sm text-green-600 mt-1">
              Obrigado por pedir no Muno. Volte sempre!
            </p>
          </div>
        )}

      </div>
    </>
  );
}
