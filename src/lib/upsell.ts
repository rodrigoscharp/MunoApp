import { CategoryWithItems } from "@/types";

export interface UpsellSuggestion {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
}

export function getUpsellSuggestions(
  cartItemIds: string[],
  categories: CategoryWithItems[],
  dismissedIds: Set<string> = new Set(),
  limit = 3
): UpsellSuggestion[] {
  const cartIdSet = new Set(cartItemIds);
  const suggestions: UpsellSuggestion[] = [];

  for (const category of categories) {
    if (category.items.length === 0) continue;

    const hasItemInCart = category.items.some((item) => cartIdSet.has(item.id));
    if (hasItemInCart) continue;

    const cheapest = category.items.reduce((min, item) =>
      item.price < min.price ? item : min
    );

    if (dismissedIds.has(cheapest.id)) continue;

    suggestions.push({
      id: cheapest.id,
      name: cheapest.name,
      price: cheapest.price,
      imageUrl: cheapest.imageUrl,
    });

    if (suggestions.length >= limit) break;
  }

  return suggestions;
}
