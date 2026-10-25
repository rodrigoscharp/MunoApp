import type { MenuItemWithCategory } from "@/types";

/**
 * O que a vitrine lê de um item: card, folha do produto, banner e busca. É o
 * mesmo recorte de `ItemDoCard` (src/lib/menu-cache.ts), declarado aqui a
 * partir do tipo público para os componentes de cliente não dependerem do
 * módulo do cache, que fala com o banco.
 */
export type ItemDaVitrine = Pick<
  MenuItemWithCategory,
  "id" | "name" | "description" | "price" | "imageUrl" | "available"
>;
