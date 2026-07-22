"use client";

import { useCart } from "@/hooks/useCart";
import { formatCurrency } from "@/lib/utils";
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CartUpsell } from "@/components/cart/CartUpsell";

export default function CartPage() {
  const { items, updateQuantity, removeItem, total, clearCart } = useCart();

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-neutral-400">
        <ShoppingBag size={56} strokeWidth={1} />
        <p className="text-lg font-medium">Seu carrinho está vazio</p>
        <Link
          href="/"
          className="text-sm text-brand hover:text-brand-dark font-medium"
        >
          Ver cardápio
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Link
        href="/"
        className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 mb-6 transition"
      >
        <ArrowLeft size={16} />
        Continuar comprando
      </Link>

      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Seu Pedido</h1>

      <div className="bg-white rounded-xl border border-neutral-200 divide-y divide-neutral-100 mb-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-3 px-5 py-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-900">{item.name}</p>
              <p className="text-xs text-neutral-400 mt-0.5">
                {formatCurrency(item.price)} cada
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                className="w-7 h-7 rounded-full border border-neutral-200 flex items-center justify-center hover:bg-neutral-50 transition"
              >
                {item.quantity === 1 ? (
                  <Trash2 size={12} className="text-brand-muted" />
                ) : (
                  <Minus size={12} />
                )}
              </button>
              <span className="text-sm font-semibold w-5 text-center">
                {item.quantity}
              </span>
              <button
                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                className="w-7 h-7 rounded-full border border-neutral-200 flex items-center justify-center hover:bg-neutral-50 transition"
              >
                <Plus size={12} />
              </button>
            </div>

            <span className="text-sm font-semibold text-neutral-900 w-16 text-right">
              {formatCurrency(item.price * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      <CartUpsell />

      {/* Total + actions */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-neutral-700">Total</span>
          <span className="text-2xl font-bold text-neutral-900">
            {formatCurrency(total())}
          </span>
        </div>

        <Link
          href="/checkout"
          className="block w-full bg-brand hover:bg-brand-dark text-white text-center font-semibold py-3 rounded-xl transition"
        >
          Finalizar Pedido
        </Link>

        <button
          onClick={clearCart}
          className="w-full text-sm text-neutral-400 hover:text-brand transition"
        >
          Limpar carrinho
        </button>
      </div>
    </div>
  );
}
