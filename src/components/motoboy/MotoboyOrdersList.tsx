"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { MapPin, Clock, Package, ChevronRight, Bike, RefreshCw, Banknote, CreditCard, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { KITCHEN_CHANNEL, tenantChannelName } from "@/lib/realtime-channel";

interface OrderItem {
  name: string;
  quantity: number;
}

interface AvailableOrder {
  id: string;
  customerName: string | null;
  deliveryAddress: string | null;
  total: number;
  createdAt: Date;
  paymentMethod: string;
  paymentStatus: string;
  items: OrderItem[];
}

interface ActiveDelivery {
  id: string;
  deliveryAddress: string | null;
  customerName: string | null;
  total: number;
}

interface Props {
  availableOrders: AvailableOrder[];
  activeDelivery: ActiveDelivery | null;
  tenantId: string;
}

export function MotoboyOrdersList({ availableOrders, activeDelivery, tenantId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [newOrderAlert, setNewOrderAlert] = useState(false);

  // Escuta a fila do restaurante. Antes era postgres_changes na tabela Order,
  // que nunca disparou (RLS em Order bloqueia a role anon) — na prática o
  // motoboy só via pedido novo ao recarregar a página na mão.
  useEffect(() => {
    const channel = supabase
      .channel(tenantChannelName(tenantId, KITCHEN_CHANNEL))
      .on("broadcast", { event: "order-updated" }, ({ payload }) => {
        const status = payload.status as string | undefined;
        const deliveryType = payload.deliveryType as string | undefined;

        if (status === "READY" && deliveryType === "DELIVERY") {
          setNewOrderAlert(true);
          toast.info("Novo pedido disponível para entrega!", { duration: 5000 });
          startTransition(() => router.refresh());
        }

        // Recarrega se algum pedido for aceito por outro motoboy
        if (status === "OUT_FOR_DELIVERY") {
          startTransition(() => router.refresh());
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, tenantId]);

  async function acceptOrder(orderId: string) {
    setAcceptingId(orderId);
    try {
      const res = await fetch(`/api/motoboy/orders/${orderId}/accept`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Erro ao aceitar pedido");
        return;
      }

      toast.success("Pedido aceito! Iniciando entrega...");
      startTransition(() => {
        router.push(`/motoboy/delivery/${orderId}`);
      });
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setAcceptingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Entregas Disponíveis</h1>
          <p className="text-neutral-400 text-sm mt-0.5">Pedidos prontos aguardando retirada</p>
        </div>
        <button
          onClick={() => {
            setNewOrderAlert(false);
            startTransition(() => router.refresh());
          }}
          disabled={pending}
          className="relative flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 px-3 py-2 rounded-lg transition"
        >
          <RefreshCw size={13} className={pending ? "animate-spin" : ""} />
          Atualizar
          {newOrderAlert && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-brand rounded-full" />
          )}
        </button>
      </div>

      {/* Entrega ativa */}
      {activeDelivery && (
        <div className="bg-brand/10 border border-brand/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bike size={16} className="text-brand" />
            <span className="text-sm font-semibold text-brand">Entrega em andamento</span>
          </div>
          <p className="text-sm text-neutral-300 mb-3">
            {activeDelivery.customerName ?? "Cliente"} · {activeDelivery.deliveryAddress}
          </p>
          <button
            onClick={() => router.push(`/motoboy/delivery/${activeDelivery.id}`)}
            className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-2.5 rounded-lg text-sm transition"
          >
            Continuar entrega →
          </button>
        </div>
      )}

      {/* Lista de pedidos disponíveis */}
      {availableOrders.length === 0 ? (
        <div className="text-center py-16 text-neutral-500">
          <Package size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum pedido disponível no momento</p>
          <p className="text-xs mt-1 text-neutral-600">Aguarde novos pedidos ficarem prontos</p>
        </div>
      ) : (
        <div className="space-y-3">
          {availableOrders.map((order) => {
            const elapsed = Math.floor(
              (Date.now() - new Date(order.createdAt).getTime()) / 60_000
            );
            const isAccepting = acceptingId === order.id;

            return (
              <div
                key={order.id}
                className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-neutral-300">
                    #{order.id.slice(-6).toUpperCase()}
                  </span>
                  <span
                    className={`text-xs flex items-center gap-1 ${
                      elapsed > 15 ? "text-red-400" : "text-neutral-500"
                    }`}
                  >
                    <Clock size={10} />
                    {elapsed}min esperando
                  </span>
                </div>

                {order.deliveryAddress && (
                  <div className="flex items-start gap-2 text-sm text-neutral-300">
                    <MapPin size={14} className="text-brand mt-0.5 flex-shrink-0" />
                    <span>{order.deliveryAddress}</span>
                  </div>
                )}

                <ul className="space-y-0.5">
                  {order.items.map((item, i) => (
                    <li key={i} className="text-xs text-neutral-500">
                      {item.quantity}× {item.name}
                    </li>
                  ))}
                </ul>

                {/* Pagamento */}
                <div className="flex items-center justify-between rounded-lg bg-neutral-800/60 px-3 py-2 text-xs">
                  <div className="flex items-center gap-1.5 text-neutral-400">
                    {order.paymentMethod === "CASH" ? (
                      <Banknote size={13} className="text-yellow-400" />
                    ) : order.paymentMethod === "CREDIT_CARD" ? (
                      <CreditCard size={13} className="text-blue-400" />
                    ) : (
                      <CreditCard size={13} className="text-purple-400" />
                    )}
                    <span>
                      {order.paymentMethod === "CASH"
                        ? "Dinheiro"
                        : order.paymentMethod === "CREDIT_CARD"
                        ? "Cartão de crédito"
                        : "PIX"}
                    </span>
                  </div>
                  {order.paymentStatus === "PAID" ? (
                    <span className="flex items-center gap-1 text-green-400 font-semibold">
                      <CheckCircle2 size={12} />
                      Já pago
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-400 font-semibold">
                      <AlertCircle size={12} />
                      Cobrar na entrega: {formatCurrency(order.total)}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
                  <span className="text-sm font-semibold text-neutral-300">
                    Total: {formatCurrency(order.total)}
                  </span>
                  <button
                    onClick={() => acceptOrder(order.id)}
                    disabled={isAccepting || !!activeDelivery || pending}
                    className="flex items-center gap-1.5 bg-brand hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg text-sm transition"
                  >
                    {isAccepting ? "Aceitando..." : "Aceitar"}
                    {!isAccepting && <ChevronRight size={14} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
