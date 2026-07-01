"use client";

import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/hooks/useCart";
import { CartFlyAnimation } from "@/components/menu/CartFlyAnimation";
import { MesaCartDrawer } from "@/components/mesa/MesaCartDrawer";
import { useState, useEffect, useRef } from "react";
import { ShoppingCart, UtensilsCrossed, Receipt } from "lucide-react";
import type { RestaurantInfo } from "@/lib/restaurant";

interface MesaHeaderProps {
  restaurantInfo: RestaurantInfo;
  tableNumber: number;
  tableName: string | null;
  token: string;
}

export function MesaHeader({ restaurantInfo, tableNumber, tableName, token }: MesaHeaderProps) {
  const itemCount = useCart((s) =>
    s.items.reduce((sum, item) => sum + item.quantity, 0)
  );

  const [cartOpen, setCartOpen] = useState(false);
  const [bounce, setBounce] = useState(false);
  const prevCount = useRef(itemCount);

  useEffect(() => {
    if (itemCount > prevCount.current) {
      setBounce(true);
      const t = setTimeout(() => setBounce(false), 400);
      prevCount.current = itemCount;
      return () => clearTimeout(t);
    }
    prevCount.current = itemCount;
  }, [itemCount]);

  const tableLabel = tableName || `Mesa ${tableNumber}`;

  return (
    <>
      <CartFlyAnimation />

      <header className="sticky top-0 z-40 bg-white border-b border-neutral-200 shadow-sm">
        {/* Mesa badge */}
        <div className="bg-brand text-white text-center text-xs font-semibold py-1.5 flex items-center justify-center gap-1.5">
          <UtensilsCrossed size={13} />
          {tableLabel} · Pague no balcão ao finalizar
        </div>

        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href={`/mesa/${token}/cardapio`} className="shrink-0 flex items-center gap-3">
            <Image
              src={restaurantInfo.logoUrl}
              alt={restaurantInfo.name}
              width={140}
              height={52}
              className="h-10 w-auto object-contain"
              loading="eager"
              fetchPriority="high"
              unoptimized={restaurantInfo.logoUrl.startsWith("http")}
            />
            <div className="flex flex-col justify-center leading-tight">
              <span className="text-sm font-bold text-neutral-900 tracking-tight">
                {restaurantInfo.name}
              </span>
              <span className="text-[11px] text-neutral-500">Cardápio digital</span>
            </div>
          </Link>

          <div className="flex items-center gap-1 shrink-0">
            <Link
              href={`/mesa/${token}/conta`}
              className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-neutral-100 transition"
              aria-label="Ver conta da mesa"
              title="Conta da mesa"
            >
              <Receipt size={20} className="text-neutral-700" />
            </Link>

            <button
              id="cart-btn"
              onClick={() => setCartOpen(true)}
              className="relative flex items-center justify-center w-10 h-10 rounded-full hover:bg-neutral-100 transition"
              aria-label="Abrir carrinho"
            >
              <ShoppingCart size={20} className="text-neutral-700" />
              {itemCount > 0 && (
                <span
                  key={itemCount}
                  className={`absolute -top-0.5 -right-0.5 bg-brand text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold leading-none ${bounce ? "animate-cart-bounce" : ""}`}
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
