"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Plus } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { formatCurrency } from "@/lib/utils";
import { getUpsellSuggestions } from "@/lib/upsell";
import { CategoryWithItems } from "@/types";

export function CartUpsell({ className = "px-6 py-4" }: { className?: string }) {
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

  return (
    <div className={className}>
      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">
        Que tal adicionar?
      </p>

      <div className="flex gap-3 overflow-x-auto snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {suggestions.map((item) => (
          <div
            key={item.id}
            className="w-32 shrink-0 snap-start bg-white rounded-2xl border border-neutral-200 overflow-hidden"
          >
            <div className="relative aspect-square bg-neutral-100">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  fill
                  sizes="128px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}

              <button
                onClick={() =>
                  addItem(
                    { id: item.id, name: item.name, price: item.price, imageUrl: item.imageUrl },
                    1
                  )
                }
                className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-brand hover:bg-brand-dark active:scale-90 text-white flex items-center justify-center shadow-md transition-all duration-150"
                aria-label={`Adicionar ${item.name}`}
              >
                <Plus size={14} strokeWidth={2.5} />
              </button>
            </div>

            <div className="px-2.5 pt-2 pb-2.5">
              <p className="text-xs font-medium text-neutral-900 leading-snug line-clamp-2 h-8">
                {item.name}
              </p>
              <p className="text-sm font-bold text-brand mt-1">
                {formatCurrency(item.price)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
