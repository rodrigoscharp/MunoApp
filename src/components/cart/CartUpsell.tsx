"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { formatCurrency } from "@/lib/utils";
import { getUpsellSuggestions } from "@/lib/upsell";
import { CategoryWithItems } from "@/types";
import { kicker } from "@/components/loja/estilos";
import { Miniatura } from "@/components/cart/LinhaDaSacola";

export function CartUpsell({ className = "px-5 py-4" }: { className?: string }) {
  const items = useCart((s) => s.items);
  const addItem = useCart((s) => s.addItem);
  const [categories, setCategories] = useState<CategoryWithItems[] | null>(null);

  useEffect(() => {
    fetch("/api/menu")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((data: CategoryWithItems[]) => setCategories(data))
      .catch(() => setCategories(null));
  }, []);

  if (!categories || items.length === 0) return null;

  const suggestions = getUpsellSuggestions(
    items.map((i) => i.id),
    categories
  );

  if (suggestions.length === 0) return null;

  // Uma sugestão ocupa a largura toda; mais de uma vira faixa de rolar, com a
  // próxima aparecendo na borda para dizer que há mais.
  const largura = suggestions.length === 1 ? "w-full" : "w-[82%] max-w-[300px]";

  return (
    <div className={className}>
      <p className={`${kicker} mb-2 text-forest-dark`}>Que tal adicionar?</p>

      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {suggestions.map((item) => (
          <div
            key={item.id}
            className={`${largura} flex shrink-0 snap-start items-center gap-3 rounded-[18px] bg-loja-pessego p-1.5 pr-2`}
          >
            <Miniatura src={item.imageUrl} tamanho={52} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[13px] font-extrabold leading-snug text-forest-dark">
                {item.name}
              </p>
              <p className="mt-0.5 text-[13px] font-bold text-loja-preco">
                {formatCurrency(item.price)}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                addItem(
                  { id: item.id, name: item.name, price: item.price, imageUrl: item.imageUrl },
                  1
                )
              }
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest-dark text-white transition hover:bg-forest active:scale-90"
              aria-label={`Adicionar ${item.name}`}
            >
              <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
