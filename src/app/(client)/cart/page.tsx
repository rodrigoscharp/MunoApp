"use client";

import { useCart } from "@/hooks/useCart";
import { formatCurrency } from "@/lib/utils";
import { ShoppingBag, ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { CartUpsell } from "@/components/cart/CartUpsell";
import { LinhaDaSacola } from "@/components/cart/LinhaDaSacola";
import { botaoBrasa, botaoContorno, cartao } from "@/components/loja/estilos";

export default function CartPage() {
  const { items, updateQuantity, total, clearCart } = useCart();

  if (items.length === 0) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-loja-pessego text-loja-preco">
          <ShoppingBag size={34} strokeWidth={1.6} aria-hidden="true" />
        </span>
        <p className="text-[17px] font-extrabold text-loja-tinta">Seu carrinho está vazio</p>
        <Link href="/" className={`${botaoContorno} mt-1 h-11`}>
          Ver cardápio
        </Link>
      </div>
    );
  }

  const unidades = items.reduce((soma, item) => soma + item.quantity, 0);

  return (
    <div className="mx-auto max-w-lg px-4 pb-10 pt-5">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/"
          aria-label="Continuar comprando"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-loja-papel text-loja-tinta shadow-loja transition hover:bg-loja-pessego-claro"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="manchete flex-1 text-[32px] text-forest-dark">Seu pedido</h1>
        <span className="text-xs font-bold text-loja-tinta-2">
          {unidades} {unidades === 1 ? "item" : "itens"}
        </span>
      </div>

      <div className="mb-4 space-y-2">
        {items.map((item) => (
          <LinhaDaSacola
            key={item.cartId}
            item={item}
            unitarioSempre
            onQuantidade={(q) => updateQuantity(item.cartId, q)}
          />
        ))}
      </div>

      <CartUpsell className="mb-4" />

      <div className={`${cartao} space-y-3 p-5`}>
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-bold text-loja-tinta-2">Total</span>
          <span className="manchete text-[32px] text-forest-dark">{formatCurrency(total())}</span>
        </div>
        <p className="text-[12px] text-loja-tinta-2">
          Entrega, cupom e pagamento você escolhe no próximo passo.
        </p>

        <Link href="/checkout" className={`${botaoBrasa} h-14 w-full text-[15px]`}>
          Finalizar Pedido
          <ArrowRight size={17} strokeWidth={2.4} aria-hidden="true" />
        </Link>

        <button
          type="button"
          onClick={clearCart}
          className="flex h-11 w-full items-center justify-center text-[13px] font-semibold text-loja-tinta-2 transition hover:text-loja-preco"
        >
          Limpar carrinho
        </button>
      </div>
    </div>
  );
}
