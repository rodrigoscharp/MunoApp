"use client";

import { iniciarPollingVisivel } from "@/lib/polling-visivel";
import { useEffect, useState } from "react";
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

export default function MesaOrderConfirmationPage() {
  const params = useParams<{ token: string; orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/orders/${params.orderId}`);
        if (res.ok) {
          const data = await res.json();
          setOrder({ ...data, total: Number(data.total) });
        }
      } catch {
        // ignore
      }
    }
    load();

    // Poll for status updates every 10s
    return iniciarPollingVisivel(load, 10000);
  }, [params.orderId]);

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
