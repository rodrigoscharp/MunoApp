"use client";

import { useState, useEffect } from "react";
import { useCart } from "@/hooks/useCart";
import { useTable } from "@/hooks/useTable";
import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatCurrency } from "@/lib/utils";
import { ArrowLeft, UtensilsCrossed } from "lucide-react";
import Link from "next/link";

const schema = z.object({
  customerName: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  customerPhone: z.string().optional().or(z.literal("")),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function MesaCheckoutPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { items, total, clearCart } = useCart();
  const { getTable } = useTable();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tableInfo, setTableInfo] = useState<{ tableId: string; tableNumber: number; tableName: string | null } | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    const ctx = getTable();
    if (ctx) {
      setTableInfo({ tableId: ctx.tableId, tableNumber: ctx.tableNumber, tableName: ctx.tableName });
    } else {
      // Fallback: fetch by token
      fetch(`/api/tables/token/${params.token}`)
        .then((r) => r.json())
        .then((t) => setTableInfo({ tableId: t.id, tableNumber: t.number, tableName: t.name }))
        .catch(() => {});
    }
  }, [params.token, getTable]);

  if (items.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-neutral-500 mb-4">Seu carrinho está vazio.</p>
        <Link href={`/mesa/${params.token}/cardapio`} className="text-brand font-medium hover:underline">
          Ver cardápio
        </Link>
      </div>
    );
  }

  const itemsTotal = total();
  const tableLabel = tableInfo?.tableName || `Mesa ${tableInfo?.tableNumber ?? ""}`;

  async function onSubmit(data: FormData) {
    setLoading(true);
    setError("");

    try {
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            menuItemId: item.id,
            quantity: item.quantity,
            notes: item.notes,
          })),
          paymentMethod: "CASH",
          notes: data.notes,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          deliveryType: "DINE_IN",
          deliveryFee: 0,
          tableId: tableInfo?.tableId,
        }),
      });

      if (!orderRes.ok) {
        const errBody = await orderRes.json().catch(() => ({}));
        throw new Error(errBody?.error ? JSON.stringify(errBody.error) : "Erro ao criar pedido");
      }

      const order = await orderRes.json();
      clearCart();
      router.push(`/mesa/${params.token}/pedido/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link
        href={`/mesa/${params.token}/cardapio`}
        className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 mb-6 transition"
      >
        <ArrowLeft size={16} />
        Voltar ao cardápio
      </Link>

      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Finalizar Pedido</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          {/* Mesa info */}
          <div className="bg-brand-light border border-brand-muted rounded-xl p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand flex items-center justify-center shrink-0">
              <UtensilsCrossed size={18} className="text-white" />
            </div>
            <div>
              <p className="font-semibold text-brand-dark">{tableLabel}</p>
              <p className="text-xs text-brand-dark/70">O pagamento é feito no balcão ao final</p>
            </div>
          </div>

          {/* Dados do cliente */}
          <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
            <h2 className="font-semibold text-neutral-900">Seus dados</h2>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Nome *</label>
              <input
                {...register("customerName")}
                placeholder="Seu nome"
                className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
              />
              {errors.customerName ? (
                <p className="text-brand text-xs mt-1">{errors.customerName.message}</p>
              ) : (
                <p className="text-neutral-400 text-xs mt-1">
                  Usaremos para identificar seu pedido na conta da mesa.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Telefone (opcional)</label>
              <input
                {...register("customerPhone")}
                placeholder="(11) 99999-9999"
                className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Observações (opcional)</label>
              <textarea
                {...register("notes")}
                placeholder="Sem cebola, ponto da carne, etc."
                rows={2}
                className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition resize-none"
              />
            </div>
          </div>

          {error && (
            <div className="bg-brand-light border border-brand-muted rounded-lg px-4 py-3">
              <p className="text-brand-dark text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition"
          >
            {loading ? "Enviando pedido..." : "Confirmar Pedido"}
          </button>
        </form>

        {/* Resumo */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5 h-fit">
          <h2 className="font-semibold text-neutral-900 mb-4">Resumo do Pedido</h2>
          <ul className="space-y-3 mb-4">
            {items.map((item) => (
              <li key={item.cartId} className="flex items-start justify-between gap-2">
                <div className="flex gap-2 min-w-0">
                  <span className="text-sm font-bold text-brand flex-shrink-0">{item.quantity}x</span>
                  <span className="text-sm text-neutral-800 truncate">{item.name}</span>
                </div>
                <span className="text-sm font-medium text-neutral-700 flex-shrink-0">
                  {formatCurrency(item.price * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-neutral-100 pt-3">
            <div className="flex items-center justify-between pt-1">
              <span className="font-semibold text-neutral-700">Total</span>
              <span className="text-xl font-bold text-neutral-900">{formatCurrency(itemsTotal)}</span>
            </div>
            <p className="text-xs text-neutral-400 mt-1">Pagamento no balcão</p>
          </div>
        </div>
      </div>
    </div>
  );
}
