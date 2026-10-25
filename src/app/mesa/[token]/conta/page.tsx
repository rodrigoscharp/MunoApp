"use client";

import { iniciarPollingVisivel } from "@/lib/polling-visivel";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { Receipt, UtensilsCrossed, ArrowRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import { botaoContorno, cartao, kicker } from "@/components/loja/estilos";
import { AvaliarNoGoogle } from "@/components/loja/AvaliarNoGoogle";

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
  avaliacao?: { url: string; restaurante: string } | null;
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

    // A conta muda quando alguém da mesa pede, coisa de minutos. 10s em cada
    // celular aberto era custo sem ganho; o botão de atualizar cobre a pressa.
    return iniciarPollingVisivel(load, 20000);
  }, [params.token]);

  const byPerson = new Map<string, Order[]>();
  for (const order of conta?.orders ?? []) {
    const name = order.customerName?.trim() || "Cliente";
    byPerson.set(name, [...(byPerson.get(name) ?? []), order]);
  }
  const grandTotal = (conta?.orders ?? []).reduce((sum, o) => sum + o.total, 0);
  const tableLabel = conta ? conta.table.name || `Mesa ${conta.table.number}` : "mesa";

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 px-4 py-8">
      <div>
        <p className={`${kicker} flex items-center gap-1.5 text-loja-preco`}>
          <Receipt size={14} aria-hidden="true" /> A conta
        </p>
        <h1 className="manchete mt-2 text-[44px] text-forest-dark">Conta da {tableLabel}</h1>
        <p className="mt-2 text-sm text-loja-tinta-2">
          Atualiza automaticamente conforme novos pedidos chegam
        </p>
      </div>

      {!conta ? (
        <div className="flex h-40 items-center justify-center gap-3 text-loja-tinta-2">
          <RefreshCw size={18} aria-hidden="true" className="animate-spin" />
          Carregando conta...
        </div>
      ) : byPerson.size === 0 ? (
        <div className={`${cartao} px-6 py-12 text-center`}>
          <p className="text-sm text-loja-tinta-2">Nenhum pedido em aberto nesta mesa ainda.</p>
          <Link
            href={`/mesa/${params.token}/cardapio`}
            className={`${botaoContorno} mt-5 h-12 text-sm`}
          >
            Ver cardápio
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {Array.from(byPerson.entries()).map(([name, orders]) => {
              const personTotal = orders.reduce((sum, o) => sum + o.total, 0);
              return (
                <div key={name} className={`${cartao} p-5`}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="truncate font-extrabold text-loja-tinta">{name}</h2>
                    <span className="shrink-0 text-sm font-extrabold text-loja-preco">
                      {formatCurrency(personTotal)}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {orders.map((order) => (
                      <div key={order.id} className="space-y-1.5 border-t border-dashed border-loja-linha pt-3">
                        {order.items.map((item) => (
                          <div key={item.id} className="flex items-start justify-between gap-2">
                            <span className="min-w-0 text-sm text-loja-tinta">
                              <span className="font-extrabold text-loja-preco">{item.quantity}×</span> {item.menuItem.name}
                            </span>
                            <span className="shrink-0 text-sm font-semibold text-loja-tinta-2">
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

          <div className={`${cartao} flex items-baseline justify-between p-5`}>
            <span className="font-extrabold text-loja-tinta">Total da mesa</span>
            <span className="manchete text-[32px] text-forest-dark">{formatCurrency(grandTotal)}</span>
          </div>

          <div className="flex items-center gap-2.5 rounded-2xl bg-loja-pessego-claro px-4 py-3">
            <UtensilsCrossed size={16} aria-hidden="true" className="shrink-0 text-loja-preco" />
            <p className="text-[13px] font-bold text-[#6A3A1E]">Pagamento no balcão ao final</p>
          </div>

          {conta.avaliacao && (
            <AvaliarNoGoogle url={conta.avaliacao.url} restaurante={conta.avaliacao.restaurante} />
          )}
        </>
      )}
    </div>
  );
}
