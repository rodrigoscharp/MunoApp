"use client";

import Link from "next/link";
import { useCart } from "@/hooks/useCart";
import { CartFlyAnimation } from "@/components/menu/CartFlyAnimation";
import { MesaCartDrawer } from "@/components/mesa/MesaCartDrawer";
import { useState } from "react";
import { ShoppingBag, UtensilsCrossed, Receipt } from "lucide-react";
import type { RestaurantInfo } from "@/lib/restaurant";
import { useAnimacaoAoMudar } from "@/hooks/useAnimacaoAoMudar";
import { MarcaDoRestaurante } from "@/components/loja/MarcaDoRestaurante";
import { ALVO_DA_SACOLA } from "@/components/loja/sacola";

interface MesaHeaderProps {
  restaurantInfo: RestaurantInfo;
  tableNumber: number;
  tableName: string | null;
  token: string;
}

/**
 * O cabeçalho da mesa. Fixo e com altura fixa, 92px (faixa h-7 + linha h-16):
 * a navegação de categorias do cardápio da mesa gruda em top-[92px], e mudar
 * uma altura aqui pede mudar o número lá (src/app/mesa/[token]/cardapio/page.tsx).
 */
export function MesaHeader({ restaurantInfo, tableNumber, tableName, token }: MesaHeaderProps) {
  const itemCount = useCart((s) => s.items.reduce((sum, item) => sum + item.quantity, 0));

  const [cartOpen, setCartOpen] = useState(false);
  // Ver a nota em useAnimacaoAoMudar: remontar reinicia a animação do CSS.
  const bounceKey = useAnimacaoAoMudar(itemCount, { apenasAoCrescer: true });

  const tableLabel = tableName || `Mesa ${tableNumber}`;

  return (
    <>
      <CartFlyAnimation />

      <header className="sticky top-0 z-40 bg-loja-creme/95 backdrop-blur">
        <div className="flex h-7 items-center justify-center gap-1.5 bg-forest-dark text-xs font-semibold text-white">
          <UtensilsCrossed size={13} aria-hidden="true" />
          {tableLabel} · Pague no balcão ao finalizar
        </div>

        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <Link
            href={`/mesa/${token}/cardapio`}
            aria-label={`${restaurantInfo.name || "Cardápio"}, cardápio da mesa`}
            className="flex min-w-0 items-center gap-3"
          >
            <MarcaDoRestaurante info={restaurantInfo} tamanho="pequena" prioridade />
            <span className="hidden truncate text-[10.5px] font-extrabold uppercase tracking-[0.2em] text-forest-dark min-[400px]:block">
              {restaurantInfo.slogan || "Cardápio digital"}
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/mesa/${token}/conta`}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-loja-papel text-loja-tinta shadow-loja transition hover:bg-white"
              aria-label="Ver conta da mesa"
              title="Conta da mesa"
            >
              <Receipt size={20} aria-hidden="true" />
            </Link>

            <button
              type="button"
              {...{ [ALVO_DA_SACOLA]: "" }}
              onClick={() => setCartOpen(true)}
              className="relative flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white shadow-loja-brasa transition active:scale-95"
              aria-label={itemCount > 0 ? `Abrir sacola, ${itemCount} ${itemCount === 1 ? "item" : "itens"}` : "Abrir sacola"}
            >
              <ShoppingBag size={20} aria-hidden="true" />
              {itemCount > 0 && (
                <span
                  key={bounceKey}
                  className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-forest-dark px-1 text-[11px] font-extrabold leading-none text-white ring-2 ring-loja-creme ${bounceKey > 0 ? "animate-cart-bounce" : ""}`}
                >
                  {itemCount > 9 ? "9+" : itemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <MesaCartDrawer open={cartOpen} onClose={() => setCartOpen(false)} token={token} />
    </>
  );
}
