"use client";

import { useCart } from "@/hooks/useCart";
import { formatCurrency } from "@/lib/utils";
import { X, Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { CartUpsell } from "@/components/cart/CartUpsell";

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const { items, updateQuantity, removeItem, total } = useCart();

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 h-full w-full max-w-sm bg-white z-50 shadow-2xl flex flex-col transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <h2 className="text-lg font-semibold">Seu Pedido</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto py-4 px-6 space-y-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-neutral-400 gap-3">
              <ShoppingBag size={48} strokeWidth={1} />
              <p className="text-sm">Seu carrinho está vazio</p>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.cartId} className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">
                    {item.name}
                  </p>
                  {item.notes ? (
                    <p className="text-xs text-brand font-medium mt-0.5 italic truncate">
                      {item.notes}
                    </p>
                  ) : (
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {formatCurrency(item.price)} cada
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(item.cartId, item.quantity - 1)}
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
                    onClick={() => updateQuantity(item.cartId, item.quantity + 1)}
                    className="w-7 h-7 rounded-full border border-neutral-200 flex items-center justify-center hover:bg-neutral-50 transition"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                <span className="text-sm font-semibold text-neutral-900 w-16 text-right">
                  {formatCurrency(item.price * item.quantity)}
                </span>
              </div>
            ))
          )}
        </div>

        <CartUpsell />

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-neutral-200 px-6 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-700">Total</span>
              <span className="text-xl font-bold text-neutral-900">
                {formatCurrency(total())}
              </span>
            </div>
            <Link
              href="/checkout"
              onClick={onClose}
              className="block w-full bg-brand hover:bg-brand-dark text-white text-center font-semibold py-3 rounded-xl transition text-sm"
            >
              Fazer Pedido
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
