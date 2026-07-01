"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { Receipt, UtensilsCrossed, ArrowRight, RefreshCw } from "lucide-react";
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
  total: number;
  customerName?: string | null;
  items: OrderItem[];
}

interface Conta {
  table: { number: number; name: string | null };
  orders: Order[];
}

export default function MesaContaPage() {
  const params = useParams<{ token: string }>();
  const [conta, setConta] = useState<Conta | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/tables/token/${params.token}/conta`);
        if (res.ok) {
          const data = await res.json();
          setConta({
            ...data,
            orders: data.orders.map((o: Order) => ({ ...o, total: Number(o.total) })),
          });
        }
      } catch {
        // ignore
      }
    }
    load();

    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [params.token]);

  const byPerson = new Map<string, Order[]>();
  for (const order of conta?.orders ?? []) {
    const name = order.customerName?.trim() || "Cliente";
    byPerson.set(name, [...(byPerson.get(name) ?? []), order]);
  }
  const grandTotal = (conta?.orders ?? []).reduce((sum, o) => sum + o.total, 0);
  const tableLabel = conta ? conta.table.name || `Mesa ${conta.table.number}` : "mesa";

  return (
    <div className="max-w-lg mx-auto px-4 py-8 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-brand flex items-center justify-center shrink-0">
          <Receipt size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Conta da {tableLabel}</h1>
          <p className="text-xs text-neutral-500">Atualiza automaticamente conforme novos pedidos chegam</p>
        </div>
      </div>

      {!conta ? (
        <div className="flex items-center justify-center h-40 gap-3 text-neutral-500">
          <RefreshCw size={18} className="animate-spin" />
          Carregando conta...
        </div>
      ) : byPerson.size === 0 ? (
        <div className="text-center py-16 text-neutral-400">
          <p className="text-sm">Nenhum pedido em aberto nesta mesa ainda.</p>
          <Link
            href={`/mesa/${params.token}/cardapio`}
            className="inline-flex items-center gap-2 text-brand font-semibold hover:underline text-sm mt-4"
          >
            Ver cardápio
            <ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {Array.from(byPerson.entries()).map(([name, orders]) => {
              const personTotal = orders.reduce((sum, o) => sum + o.total, 0);
              return (
                <div key={name} className="bg-white rounded-xl border border-neutral-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold text-neutral-900">{name}</h2>
                    <span className="text-sm font-bold text-neutral-900">{formatCurrency(personTotal)}</span>
                  </div>
                  <div className="space-y-3">
                    {orders.map((order) => (
                      <div key={order.id} className="border-t border-neutral-100 pt-3 space-y-1.5">
                        {order.items.map((item) => (
                          <div key={item.id} className="flex justify-between items-start gap-2">
                            <span className="text-sm text-neutral-700 min-w-0">
                              <span className="font-bold text-brand">{item.quantity}x</span> {item.menuItem.name}
                            </span>
                            <span className="text-sm text-neutral-500 shrink-0">
                              {formatCurrency(Number(item.unitPrice) * item.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-5 flex items-center justify-between">
            <span className="font-semibold text-neutral-700">Total da mesa</span>
            <span className="text-xl font-bold text-neutral-900">{formatCurrency(grandTotal)}</span>
          </div>

          <div className="bg-brand-light rounded-lg px-4 py-3 flex items-center gap-2">
            <UtensilsCrossed size={15} className="text-brand shrink-0" />
            <p className="text-xs text-brand-dark">Pagamento no balcão ao final</p>
          </div>
        </>
      )}
    </div>
  );
}
