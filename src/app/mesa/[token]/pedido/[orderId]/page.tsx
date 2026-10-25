"use client";

import { iniciarPollingVisivel } from "@/lib/polling-visivel";
import { useEffect, useState } from "react";
import { useOrderRealtime } from "@/hooks/useOrderRealtime";
import { useParams } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { Check, UtensilsCrossed, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Raminho } from "@/components/loja/Raminho";
import { botaoFloresta, cartao, kicker } from "@/components/loja/estilos";

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
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-4 py-4">
      <section className="relative isolate overflow-hidden rounded-[28px] bg-forest-dark px-5 pb-6 pt-5">
        <Raminho className="pointer-events-none absolute -right-10 top-4 -z-10 h-[190px] w-[190px] text-forest" />
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-forest text-loja-pessego"
        >
          <Check size={24} strokeWidth={2.5} />
        </span>
        <h1 className="manchete mt-4 text-[44px] text-white">Pedido enviado!</h1>
        <p className="mt-2 max-w-[28ch] text-[13px] leading-relaxed text-white/80">
          Seu pedido foi recebido pela cozinha. Relaxa que vem logo!
        </p>
      </section>

      {order && (
        <div className={`${cartao} space-y-3 px-4 py-4`}>
          <div className="flex items-center justify-between gap-3">
            <span className={`${kicker} text-loja-tinta-2`}>Status</span>
            <span role="status" className="rounded-full bg-loja-pessego px-3 py-1 text-sm font-extrabold text-loja-preco">
              {STATUS_LABELS[order.status] ?? order.status}
            </span>
          </div>

          <div className="space-y-2.5 border-t border-dashed border-loja-linha pt-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex h-6 min-w-6 shrink-0 items-center justify-center rounded-lg bg-loja-pessego px-1 text-xs font-extrabold tabular-nums text-loja-preco">
                    {item.quantity}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold leading-snug text-loja-tinta">
                      {item.menuItem.name}
                    </p>
                    {item.notes && (
                      <p className="mt-0.5 text-xs italic text-loja-tinta-2">{item.notes}</p>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-[13px] font-bold text-loja-tinta">
                  {formatCurrency(Number(item.unitPrice) * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-baseline justify-between border-t border-dashed border-loja-linha pt-3">
            <span className="text-[13px] font-extrabold text-loja-tinta">Total</span>
            <span className="manchete text-2xl text-forest-dark tabular-nums">
              {formatCurrency(order.total)}
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-2xl bg-loja-folha px-4 py-3">
            <UtensilsCrossed size={15} aria-hidden="true" className="shrink-0 text-forest" />
            <p className="text-xs font-semibold text-forest-dark">Pagamento no balcão ao final</p>
          </div>
        </div>
      )}

      <Link
        href={`/mesa/${params.token}/cardapio`}
        className={`${botaoFloresta} h-14 w-full text-sm font-extrabold`}
      >
        Adicionar mais itens
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}
