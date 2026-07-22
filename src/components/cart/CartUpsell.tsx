"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { formatCurrency } from "@/lib/utils";
import { getUpsellSuggestions } from "@/lib/upsell";
import { CategoryWithItems } from "@/types";

export function CartUpsell() {
  const items = useCart((s) => s.items);
  const addItem = useCart((s) => s.addItem);
  const [categories, setCategories] = useState<CategoryWithItems[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/menu")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((data: CategoryWithItems[]) => setCategories(data))
      .catch(() => setCategories(null));
  }, []);

  if (!categories || items.length === 0) return null;

  const suggestions = getUpsellSuggestions(
    items.map((i) => i.id),
    categories,
    dismissed
  );

  if (suggestions.length === 0) return null;

  return (
    <div className="px-6 py-3 space-y-2">
      <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
        Que tal adicionar?
      </p>
      {suggestions.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 bg-neutral-50 rounded-xl px-3 py-2"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate">
              {item.name}
            </p>
            <p className="text-xs text-neutral-500">{formatCurrency(item.price)}</p>
          </div>
          <button
            onClick={() =>
              addItem(
                { id: item.id, name: item.name, price: item.price, imageUrl: item.imageUrl },
                1
              )
            }
            className="w-8 h-8 rounded-full bg-brand hover:bg-brand-dark text-white flex items-center justify-center transition shrink-0"
            aria-label={`Adicionar ${item.name}`}
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => setDismissed((prev) => new Set(prev).add(item.id))}
            className="text-neutral-300 hover:text-neutral-500 transition shrink-0"
            aria-label="Dispensar sugestão"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
