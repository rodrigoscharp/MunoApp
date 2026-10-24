"use client";

import { iniciarPollingVisivel } from "@/lib/polling-visivel";
import { useEffect, useState } from "react";
import { useOrderRealtime } from "@/hooks/useOrderRealtime";
import { useParams } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { CheckCircle, UtensilsCrossed, ArrowRight } from "lucide-react";
import Link from "next/link";

interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: number;
  notes?: string | null;
  menuItem: { name: string };
}

interface Order {
  id: string;
  status: string;
  total: number;
  customerName?: string | null;
  items: OrderItem[];
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Aguardando confirmação",
  CONFIRMED: "Confirmado",
  IN_PREPARATION: "Em preparo",
  READY: "Pronto",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
};

async function buscarPedido(orderId: string): Promise<Order | null> {
  try {
    const res = await fetch(`/api/orders/${orderId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return { ...data, total: Number(data.total) };
  } catch {
    // Falha passageira: a próxima volta do polling tenta de novo.
    return null;
  }
}

export default function MesaOrderConfirmationPage() {
  const params = useParams<{ token: string; orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);

  // Pedido de mesa sem conta não tem dono, e canViewOrder libera o canal do
  // pedido para quem tem o link: o aviso chega na hora pelo tempo real.
  const { updatedAt } = useOrderRealtime(params.orderId);

  useEffect(() => {
    const load = () => {
      buscarPedido(params.orderId).then((o) => o && setOrder(o));
    };
    load();
    // Reserva para quando o canal de tempo real não vier (tópico recusado,
    // Supabase fora do ar). Com o aviso instantâneo, 30s basta.
    return iniciarPollingVisivel(load, 30000);
  }, [params.orderId]);

  // O aviso traz só o status; o pedido inteiro vem da rota, que é a fonte
  // de verdade (itens, total) e não depende do formato do broadcast.
  useEffect(() => {
    if (!updatedAt) return;
    buscarPedido(params.orderId).then((o) => o && setOrder(o));
  }, [updatedAt, params.orderId]);

  return (
    <div className="max-w-lg mx-auto px-4 py-12 flex flex-col items-center gap-6 text-center">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle size={40} className="text-green-600" />
      </div>

      <div>
        <h1 className="text-2xl font-black text-neutral-900 mb-2">Pedido enviado!</h1>
        <p className="text-neutral-500 text-sm">
          Seu pedido foi recebido pela cozinha. Relaxa que vem logo!
        </p>
      </div>

      {order && (
        <div className="w-full bg-white rounded-xl border border-neutral-200 p-5 text-left space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400 font-medium uppercase tracking-wide">Status</span>
            <span className="text-sm font-semibold text-brand">
              {STATUS_LABELS[order.status] ?? order.status}
            </span>
          </div>

          <div className="border-t border-neutral-100 pt-3 space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <span className="text-sm text-neutral-700">
                    <span className="font-bold text-brand">{item.quantity}x</span> {item.menuItem.name}
                  </span>
                  {item.notes && (
                    <p className="text-xs text-neutral-400 italic">{item.notes}</p>
                  )}
                </div>
                <span className="text-sm font-medium text-neutral-600 shrink-0">
                  {formatCurrency(Number(item.unitPrice) * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-neutral-100 pt-3 flex justify-between items-center">
            <span className="font-semibold text-neutral-700">Total</span>
            <span className="text-xl font-bold text-neutral-900">{formatCurrency(order.total)}</span>
          </div>

          <div className="bg-brand-light rounded-lg px-4 py-3 flex items-center gap-2">
            <UtensilsCrossed size={15} className="text-brand shrink-0" />
            <p className="text-xs text-brand-dark">Pagamento no balcão ao final</p>
          </div>
        </div>
      )}

      <Link
        href={`/mesa/${params.token}/cardapio`}
        className="flex items-center gap-2 text-brand font-semibold hover:underline text-sm"
      >
        Adicionar mais itens
        <ArrowRight size={15} />
      </Link>
    </div>
  );
}
