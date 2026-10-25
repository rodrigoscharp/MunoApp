"use client";

import { useOrderRealtime } from "@/hooks/useOrderRealtime";
import { formatCurrency, PAYMENT_METHOD_LABELS } from "@/lib/utils";
import { OrderStatus, PaymentMethod, PaymentStatus } from "@/types";
import { LiveDeliveryTracker } from "@/components/delivery/LiveDeliveryTracker";
import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { useAnimacaoAoMudar } from "@/hooks/useAnimacaoAoMudar";
import { PixPayment } from "@/components/tracking/PixPayment";
import { Raminho } from "@/components/loja/Raminho";
import { botaoFloresta, cartao, kicker } from "@/components/loja/estilos";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface OrderSummary {
  id: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  total: number;
  deliveryFee?: number;
  discount?: number;
  couponCode?: string | null;
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
  canChat: boolean;
  /**
   * QR e copia-e-cola do Pix, quando o pedido acabou de ser criado. Mora aqui,
   * e não na página, porque é o tracker que sabe quando o pagamento entrou:
   * renderizado pelo servidor, o QR ficava na tela depois de pago.
   */
  pix?: { qrSrc: string | null; copyPaste: string } | null;
}

// ─── Configuração dos status ───────────────────────────────────────────────────

/**
 * `title` é o nome do status (o cabeçalho que o leitor de tela anuncia);
 * `manchete` é a frase grande do topo, em caixa alta pelo CSS. As manchetes
 * evitam "pago", "Pix" e "ao vivo": esses termos têm lugar próprio na tela e
 * repeti-los no topo duplicaria a informação para quem lê com leitor de tela.
 */
const STATUS_CONFIG: Record<
  OrderStatus,
  { title: string; manchete: string; message: string }
> = {
  PENDING: {
    title: "Pedido recebido",
    manchete: "Tá na fila da cozinha.",
    message: "Aguardando confirmação do restaurante",
  },
  CONFIRMED: {
    title: "Pedido confirmado",
    manchete: "A cozinha já aceitou.",
    message: "O restaurante confirmou seu pedido",
  },
  IN_PREPARATION: {
    title: "Em preparo",
    manchete: "Seu pedido tá na chapa.",
    message: "Nossa cozinha está preparando tudo com cuidado",
  },
  READY: {
    title: "Pronto!",
    manchete: "Pronto e embalado.",
    message: "Pedido embalado e pronto para retirada",
  },
  OUT_FOR_DELIVERY: {
    title: "A caminho!",
    manchete: "Tá indo até você.",
    message: "Seu pedido está saindo para entrega agora",
  },
  DELIVERED: {
    title: "Entregue!",
    manchete: "Chegou. Bom apetite!",
    message: "Bom apetite! Esperamos que aproveite",
  },
  CANCELLED: {
    title: "Cancelado",
    manchete: "Pedido cancelado.",
    message: "Este pedido foi cancelado",
  },
};

/** O traço de cada status, no mesmo desenho dos ícones de categoria da loja. */
const ICONE_DO_STATUS: Record<OrderStatus, React.ReactNode> = {
  PENDING: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  CONFIRMED: <path d="M5 12l5 5 9-10" />,
  IN_PREPARATION: (
    <path d="M12 3c2 3-1 4 1 7 1-1 2-2 2-4 3 2 4 5 4 7a7 7 0 0 1-14 0c0-4 4-6 7-10z" />
  ),
  READY: (
    <>
      <path d="M5 8h14l-1 13H6z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  OUT_FOR_DELIVERY: (
    <path d="M5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M9 17h6M3 13h11l3-5h3" />
  ),
  DELIVERED: (
    <>
      <path d="M4 10.5L12 4l8 6.5V20H4z" />
      <path d="M9 14l2 2 4-4" />
    </>
  ),
  CANCELLED: <path d="M7 7l10 10M17 7L7 17" />,
};

function IconeDoStatus({
  status,
  className,
  strokeWidth = 2,
}: {
  status: OrderStatus;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {ICONE_DO_STATUS[status]}
    </svg>
  );
}

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
    <div className="relative mt-3 flex items-center gap-4">
      <div className="flex flex-col">
        <span className="text-[11px] font-bold text-forest-light/85">
          {isRouteEta ? "Chegada estimada · por rota" : "Previsão de entrega"}
        </span>
        <span className="manchete text-[40px] leading-none text-white tabular-nums">
          {timeStr}
        </span>
      </div>
      {remaining > 0 && (
        <>
          <span aria-hidden="true" className="h-10 w-px bg-forest" />
          <div className="flex flex-col">
            <span className="manchete text-[40px] leading-none text-loja-pessego tabular-nums">
              {remaining}
            </span>
            <span className="text-[11px] font-bold text-forest-light/85">minutos</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export function OrderTracker({ orderId, initialStatus, order, canChat, pix }: Props) {
  const {
    status: realtimeStatus,
    paymentStatus: realtimePaymentStatus,
    estimatedDeliveryAt: realtimeEta,
  } = useOrderRealtime(orderId, { status: initialStatus });
  const currentStatus = realtimeStatus ?? initialStatus;
  const paymentStatus = realtimePaymentStatus ?? order.paymentStatus;
  const aguardandoPix = order.paymentMethod === "PIX" && paymentStatus !== "PAID";

  const estimatedDeliveryAt =
    realtimeEta ??
    (order.estimatedDeliveryAt ? new Date(order.estimatedDeliveryAt) : null);

  const isCancelled = currentStatus === "CANCELLED";
  const isDelivered = currentStatus === "DELIVERED";
  const isOutForDelivery = currentStatus === "OUT_FOR_DELIVERY";
  const currentIndex = STEPS.indexOf(currentStatus);
  const cfg = STATUS_CONFIG[currentStatus];
  const emCurso = !isCancelled && !isDelivered;

  const mostraMapa =
    isOutForDelivery && order.deliveryType === "DELIVERY" && !!order.deliveryAddress;

  // Pulsa o ícone quando o status muda. Qualquer mudança conta — inclusive um
  // retrocesso feito pela cozinha.
  const pulseKey = useAnimacaoAoMudar(currentStatus);

  return (
    <>
      {/* Keyframes locais: só esta tela usa o pulo do ícone e o ponto do "ao
          vivo". `motion-reduce` desliga os dois para quem pediu menos
          movimento no sistema. */}
      <style>{`
        @keyframes status-pop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.12); }
          70%  { transform: scale(0.96); }
          100% { transform: scale(1); }
        }
        @keyframes fade-slide-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dot-ping {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.8); opacity: 0; }
        }
        .status-pop { animation: status-pop 0.5s cubic-bezier(.36,.07,.19,.97); }
        .fade-in    { animation: fade-slide-up 0.4s ease both; }
        .dot-ping   { animation: dot-ping 1.5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .status-pop, .fade-in, .dot-ping { animation: none; }
        }
      `}</style>

      <div className="space-y-3">
        {/* ── Topo do status ─────────────────────────────────────────────── */}
        <section
          aria-labelledby="titulo-do-status"
          className={`relative isolate overflow-hidden rounded-[28px] px-5 pb-6 pt-5 ${
            isCancelled ? "bg-loja-tinta" : "bg-forest-dark"
          }`}
        >
          <Raminho className="pointer-events-none absolute -right-10 top-6 -z-10 h-[200px] w-[200px] text-forest" />

          {/* Ícone do status, no lugar da foto do mockup. Decorativo: o
              status já está escrito no cabeçalho. */}
          <div
            key={pulseKey}
            aria-hidden="true"
            className={`pointer-events-none absolute -bottom-10 -right-9 -z-10 flex h-[150px] w-[150px] items-center justify-center rounded-full ring-[6px] ${
              isCancelled ? "bg-white/5 ring-white/10" : "bg-forest ring-forest/60"
            } ${pulseKey > 0 ? "status-pop" : ""}`}
          >
            <IconeDoStatus
              status={currentStatus}
              strokeWidth={1.6}
              className={`-translate-x-3 -translate-y-3 h-14 w-14 ${
                isCancelled ? "text-white/40" : "text-loja-pessego"
              }`}
            />
          </div>

          <div className="flex min-h-7 items-center justify-between gap-3">
            <span className="text-xs font-bold text-forest-light/85">
              Pedido #{orderId.slice(-6).toUpperCase()}
            </span>
            {emCurso && (
              <span className="flex h-7 items-center gap-1.5 rounded-full bg-forest px-2.5 text-[11px] font-extrabold uppercase tracking-wider text-forest-light">
                <span aria-hidden="true" className="relative flex h-2 w-2">
                  <span className="dot-ping absolute inset-0 rounded-full bg-loja-pessego" />
                  <span className="relative h-2 w-2 rounded-full bg-loja-pessego" />
                </span>
                Ao vivo
              </span>
            )}
          </div>

          <h1
            id="titulo-do-status"
            key={currentStatus}
            className={`${kicker} fade-in mt-4 ${
              isCancelled ? "text-white/75" : "text-loja-pessego"
            }`}
          >
            {cfg.title}
          </h1>
          <p className="manchete fade-in mt-2 max-w-[15ch] text-[44px] text-white">
            {cfg.manchete}
          </p>
          <p className="mt-2 max-w-[26ch] text-[13px] leading-relaxed text-white/80">
            {cfg.message}
          </p>

          {estimatedDeliveryAt && !isDelivered && !isCancelled && (
            <EtaDisplay
              estimatedDeliveryAt={estimatedDeliveryAt}
              isRouteEta={isOutForDelivery && !!realtimeEta}
            />
          )}
        </section>

        {/* ── Pix ─────────────────────────────────────────────────────────── */}
        {pix && order.paymentMethod === "PIX" && !isCancelled && (
          aguardandoPix ? (
            <PixPayment qrSrc={pix.qrSrc} copyPaste={pix.copyPaste} />
          ) : (
            <div
              role="status"
              className={`${cartao} flex items-center gap-3 px-4 py-3`}
            >
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-loja-folha text-forest"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M5 12l5 5 9-10" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-forest-dark">Pagamento confirmado</p>
                <p className="text-xs text-loja-tinta-2">Recebemos seu Pix. Agora é com a cozinha.</p>
              </div>
            </div>
          )
        )}

        {/* ── Etapas ──────────────────────────────────────────────────────── */}
        {!isCancelled && (
          <ol
            aria-label="Etapas do pedido"
            className={`${cartao} grid grid-cols-3 gap-x-1 gap-y-4 p-4 sm:grid-cols-6`}
          >
            {STEPS.map((step, i) => {
              const isCompleted = i < currentIndex;
              const isCurrent = i === currentIndex;
              const estado = isCompleted ? "concluido" : isCurrent ? "atual" : "futuro";

              return (
                <li
                  key={step}
                  data-estado={estado}
                  aria-current={isCurrent ? "step" : undefined}
                  className="flex flex-col items-center gap-2 text-center"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-500 ${
                      isCompleted
                        ? "bg-forest text-white"
                        : isCurrent
                        ? "bg-brand text-white ring-[5px] ring-loja-pessego"
                        : "bg-loja-linha text-loja-tinta-2"
                    }`}
                  >
                    <IconeDoStatus
                      status={step}
                      strokeWidth={isCurrent || isCompleted ? 2 : 1.8}
                      className="h-[18px] w-[18px]"
                    />
                  </span>
                  <span className="flex flex-col text-[11px] leading-tight">
                    <span
                      className={
                        isCompleted
                          ? "font-bold text-forest-dark"
                          : isCurrent
                          ? "font-extrabold text-loja-preco"
                          : "font-semibold text-loja-tinta-2"
                      }
                    >
                      {STEP_LABELS[step]}
                    </span>
                    {isCompleted && <span className="sr-only">concluído</span>}
                    {isCurrent && (
                      <span className="font-semibold text-loja-preco">Status atual</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {/* ── Mapa ao vivo ───────────────────────────────────────────────── */}
        {mostraMapa && order.deliveryAddress && (
          <LiveDeliveryTracker
            orderId={orderId}
            deliveryAddress={order.deliveryAddress}
            initialLat={order.initialLat}
            initialLng={order.initialLng}
          />
        )}

        {/* ── Endereço ───────────────────────────────────────────────────── */}
        {/* Com o mapa na tela, o endereço já vai no rodapé dele. */}
        {!mostraMapa && !isCancelled && order.deliveryType === "DELIVERY" && order.deliveryAddress && (
          <div className={`${cartao} flex items-center gap-3 px-4 py-3`}>
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-loja-pessego text-brand"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]">
                <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-xs text-loja-tinta-2">Entregar em</p>
              <p className="text-[13px] font-extrabold leading-snug text-loja-tinta">
                {order.deliveryAddress}
              </p>
            </div>
          </div>
        )}

        {/* ── Itens do pedido ────────────────────────────────────────────── */}
        <div className={`${cartao} px-4 py-4`}>
          <h2 className={`${kicker} mb-3 text-loja-tinta-2`}>Itens do pedido</h2>
          <ul className="space-y-2.5">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 min-w-6 shrink-0 items-center justify-center rounded-lg bg-loja-pessego px-1 text-xs font-extrabold tabular-nums text-loja-preco">
                  {item.quantity}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-snug text-loja-tinta">
                    {item.menuItem.name}
                  </p>
                  {item.notes && (
                    <p className="mt-0.5 text-xs italic text-loja-tinta-2">{item.notes}</p>
                  )}
                </div>
                <span className="shrink-0 text-[13px] font-bold text-loja-tinta">
                  {formatCurrency(item.unitPrice * item.quantity)}
                </span>
              </li>
            ))}
          </ul>

          {/* Taxa e desconto: só aparecem quando existem, para não poluir o
              recibo de um pedido simples de retirada. */}
          {(Number(order.deliveryFee ?? 0) > 0 || Number(order.discount ?? 0) > 0) && (
            <div className="mt-3 space-y-1.5 border-t border-dashed border-loja-linha pt-3 text-[13px]">
              <div className="flex items-center justify-between text-loja-tinta-2">
                <span>Subtotal</span>
                <span>
                  {formatCurrency(
                    order.total - Number(order.deliveryFee ?? 0) + Number(order.discount ?? 0)
                  )}
                </span>
              </div>
              {Number(order.deliveryFee ?? 0) > 0 && (
                <div className="flex items-center justify-between text-loja-tinta-2">
                  <span>Taxa de entrega</span>
                  <span>{formatCurrency(Number(order.deliveryFee))}</span>
                </div>
              )}
              {Number(order.discount ?? 0) > 0 && (
                <div className="flex items-center justify-between font-bold text-forest-dark">
                  <span className="flex items-center gap-1">
                    Desconto
                    {order.couponCode && (
                      <span className="font-mono text-xs">· {order.couponCode}</span>
                    )}
                  </span>
                  <span>-{formatCurrency(Number(order.discount))}</span>
                </div>
              )}
            </div>
          )}

          {/* Total */}
          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-dashed border-loja-linha pt-3">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-extrabold text-loja-tinta">
                {PAYMENT_METHOD_LABELS[order.paymentMethod]}
              </span>
              {paymentStatus === "PAID" && (
                <span className="rounded-full bg-loja-folha px-2 py-0.5 text-xs font-bold text-forest-dark">
                  Pago ✓
                </span>
              )}
            </div>
            <span className="manchete text-2xl text-forest-dark tabular-nums">
              {formatCurrency(order.total)}
            </span>
          </div>
        </div>

        {/* ── Entregue ───────────────────────────────────────────────────── */}
        {isDelivered && (
          <div className="relative isolate overflow-hidden rounded-[20px] bg-loja-folha px-5 py-5 text-center">
            <Raminho
              cheio
              className="pointer-events-none absolute -left-6 -top-6 -z-10 h-24 w-24 text-forest/10"
            />
            <p className="manchete text-[28px] text-forest-dark">Bom apetite!</p>
            <p className="mt-1 text-sm text-forest-dark">
              Obrigado por pedir no Muno. Volte sempre!
            </p>
          </div>
        )}

        {/* ── Chat com o restaurante ─────────────────────────────────────── */}
        {!isCancelled && canChat && (
          <Link
            href={`/pedidos/${orderId}/chat`}
            className={`${botaoFloresta} h-14 w-full text-sm font-extrabold`}
          >
            <MessageSquare size={18} aria-hidden="true" />
            Chat com o restaurante
          </Link>
        )}
      </div>
    </>
  );
}
