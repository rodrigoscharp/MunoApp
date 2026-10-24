"use client";

import Image from "next/image";
import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { useCart } from "@/hooks/useCart";
import { triggerCartFly } from "@/components/menu/CartFlyAnimation";
import { formatCurrency } from "@/lib/utils";
import { MenuItemWithCategory } from "@/types";
import { AddToCartModal } from "@/components/menu/AddToCartModal";

export function ProductCard({
  item,
  restaurantOpen = true,
  prioridade = false,
}: {
  item: MenuItemWithCategory;
  restaurantOpen?: boolean;
  /**
   * Os primeiros cards, acima da dobra, são candidatos a LCP. Com isso a foto
   * sai na frente das outras em vez de esperar o lazy loading descobri-la.
   * Não usa `preload` (o antigo `priority`): a doc do Next o desaconselha
   * quando há várias imagens candidatas, que é o caso de uma grade.
   */
  prioridade?: boolean;
}) {
  const addItem = useCart((s) => s.addItem);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [showModal, setShowModal] = useState(false);

  function handleConfirm(notes: string, quantity: number) {
    addItem(
      { id: item.id, name: item.name, price: item.price, imageUrl: item.imageUrl, notes: notes || undefined },
      quantity
    );
    if (btnRef.current) triggerCartFly(btnRef.current);
    setShowModal(false);
  }

  return (
    <>
      <div className="group bg-white rounded-2xl border border-neutral-200 overflow-hidden flex flex-col h-full hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
        <div className="relative h-36 sm:h-40 bg-neutral-100 overflow-hidden">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              // No celular o card é uma faixa de rolagem com largura fixa
              // (w-44, 176px, na página); 50vw pedia o dobro em telas largas.
              sizes="(max-width: 640px) 176px, (max-width: 1024px) 33vw, 25vw"
              loading={prioridade ? "eager" : "lazy"}
              fetchPriority={prioridade ? "high" : undefined}
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-10 h-10 text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          {!item.available && (
            <div className="absolute inset-0 bg-white/75 flex items-center justify-center">
              <span className="text-xs font-medium text-neutral-500 bg-white/90 px-3 py-1 rounded-full border border-neutral-200">
                Indisponível
              </span>
            </div>
          )}
        </div>

        <div className="p-3 sm:p-4 flex flex-col flex-1">
          <h3 className="font-semibold text-neutral-900 text-sm leading-snug line-clamp-2">
            {item.name}
          </h3>
          {item.description && (
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed line-clamp-2">
              {item.description}
            </p>
          )}
          <div className="mt-auto pt-3 flex items-center justify-between gap-2">
            <span className="text-base font-bold text-brand">
              {formatCurrency(item.price)}
            </span>
            <button
              ref={btnRef}
              onClick={() => setShowModal(true)}
              disabled={!item.available || !restaurantOpen}
              title={!restaurantOpen ? "Restaurante fechado no momento" : undefined}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-brand hover:bg-brand-dark active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all duration-150 shadow-sm"
            >
              <Plus size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <AddToCartModal
          item={item}
          onConfirm={handleConfirm}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
