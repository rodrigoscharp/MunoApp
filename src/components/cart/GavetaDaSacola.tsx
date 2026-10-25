"use client";

import { useId } from "react";
import Link from "next/link";
import { ArrowRight, ShoppingBag, X } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { formatCurrency } from "@/lib/utils";
import { botaoBrasa, botaoContorno } from "@/components/loja/estilos";
import { LinhaDaSacola } from "@/components/cart/LinhaDaSacola";

/**
 * A gaveta da sacola, comum ao delivery (CartDrawer) e à mesa
 * (MesaCartDrawer). O que muda entre os dois é para onde o pedido segue, a
 * nota embaixo do total e se há sugestões; a casca é a mesma.
 *
 * O fundo escuro só existe com a gaveta aberta, e a gaveta fechada fica
 * `inert`: ela continua montada para a transição, e sem isso os botões dela
 * recebiam o Tab fora da tela.
 */
export function GavetaDaSacola({
  open,
  onClose,
  hrefDoPedido,
  nota,
  sugestoes,
}: {
  open: boolean;
  onClose: () => void;
  hrefDoPedido: string;
  /** Uma linha embaixo do total, sobre o que vem no próximo passo. */
  nota: string;
  sugestoes?: React.ReactNode;
}) {
  const { items, updateQuantity, total } = useCart();
  const tituloId = useId();
  const unidades = items.reduce((soma, item) => soma + item.quantity, 0);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-loja-tinta/45 backdrop-blur-[2px]"
          onClick={onClose}
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        inert={!open}
        className={`loja fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-loja-creme shadow-loja-alta transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <h2 id={tituloId} className="manchete flex-1 text-[30px] text-forest-dark">
            Seu pedido
          </h2>
          {unidades > 0 && (
            <span className="text-xs font-bold text-loja-tinta-2">
              {unidades} {unidades === 1 ? "item" : "itens"}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-loja-papel text-loja-tinta shadow-loja transition hover:bg-loja-pessego-claro"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-loja-pessego text-loja-preco">
                <ShoppingBag size={34} strokeWidth={1.6} aria-hidden="true" />
              </span>
              <p className="text-[15px] font-extrabold text-loja-tinta">Seu carrinho está vazio</p>
              <p className="text-[13px] text-loja-tinta-2">
                Escolha algo no cardápio e ele aparece aqui.
              </p>
              <button type="button" onClick={onClose} className={`${botaoContorno} mt-2 h-11`}>
                Ver cardápio
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <LinhaDaSacola
                  key={item.cartId}
                  item={item}
                  onQuantidade={(q) => updateQuantity(item.cartId, q)}
                />
              ))}
            </div>
          )}

          {sugestoes}
        </div>

        {items.length > 0 && (
          <div className="space-y-2.5 border-t border-loja-linha bg-loja-creme px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-12px_24px_-12px_rgba(74,48,28,0.18)]">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-bold text-loja-tinta-2">Total</span>
              <span className="manchete text-[30px] text-forest-dark">{formatCurrency(total())}</span>
            </div>
            <p className="text-[12px] text-loja-tinta-2">{nota}</p>
            <Link
              href={hrefDoPedido}
              onClick={onClose}
              className={`${botaoBrasa} h-14 w-full text-[15px]`}
            >
              Fazer pedido
              <ArrowRight size={17} strokeWidth={2.4} aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
