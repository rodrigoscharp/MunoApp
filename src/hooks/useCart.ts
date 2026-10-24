"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CartItem } from "@/types";

interface CartStore {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity" | "cartId">, quantity?: number) => void;
  removeItem: (cartId: string) => void;
  updateQuantity: (cartId: string, quantity: number) => void;
  updateNotes: (cartId: string, notes: string) => void;
  clearCart: () => void;
  total: () => number;
  itemCount: () => number;
}

/**
 * Um carrinho por contexto: o do delivery e um por mesa.
 *
 * Os dois viviam na mesma chave, e o que o cliente separou em casa aparecia
 * no pedido da mesa (e o da mesa voltava no delivery). O delivery ficou com a
 * chave antiga, `muno-cart`, e essa é a migração inteira: quem já tinha
 * carrinho guardado o encontra onde estava. A mesa ganha `muno-cart:mesa:<token>`,
 * para que o QR de outra mesa não herde o pedido da anterior.
 */
export type ContextoDoCarrinho = "delivery" | `mesa:${string}`;

const CHAVE_DO_DELIVERY = "muno-cart";

export function contextoPeloCaminho(pathname: string): ContextoDoCarrinho {
  const mesa = /^\/mesa\/([^/]+)/.exec(pathname);
  return mesa ? `mesa:${decodeURIComponent(mesa[1])}` : "delivery";
}

export function chaveDoCarrinho(contexto: ContextoDoCarrinho): string {
  return contexto === "delivery" ? CHAVE_DO_DELIVERY : `${CHAVE_DO_DELIVERY}:${contexto}`;
}

// A chave inicial sai da URL de carregamento, e não de um efeito: o persist
// hidrata na criação do store, e um efeito chegaria depois de o carrinho do
// contexto errado já ter aparecido na tela.
const contextoInicial: ContextoDoCarrinho =
  typeof window === "undefined" ? "delivery" : contextoPeloCaminho(window.location.pathname);

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item, quantity = 1) => {
        const cartId = `${item.id}::${item.notes ?? ""}`;
        set((state) => {
          const existing = state.items.find((i) => i.cartId === cartId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.cartId === cartId ? { ...i, quantity: i.quantity + quantity } : i
              ),
            };
          }
          return { items: [...state.items, { ...item, cartId, quantity }] };
        });
      },

      removeItem: (cartId) => {
        set((state) => ({ items: state.items.filter((i) => i.cartId !== cartId) }));
      },

      updateQuantity: (cartId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(cartId);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.cartId === cartId ? { ...i, quantity } : i
          ),
        }));
      },

      updateNotes: (cartId, notes) => {
        set((state) => ({
          items: state.items.map((i) => (i.cartId === cartId ? { ...i, notes } : i)),
        }));
      },

      clearCart: () => set({ items: [] }),

      total: () =>
        get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),

      itemCount: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    {
      name: chaveDoCarrinho(contextoInicial),
      partialize: (state) => ({ items: state.items }),
      // Chave vazia é carrinho vazio. O merge padrão manteria os itens que
      // estavam na memória, e trocar de contexto levaria o carrinho junto.
      merge: (guardado, atual) => ({
        ...atual,
        items: (guardado as { items?: CartItem[] } | undefined)?.items ?? [],
      }),
    }
  )
);

/**
 * Aponta o carrinho para o contexto pedido e carrega o que estava guardado
 * nele. Chamado pelos layouts (delivery e mesa), para cobrir a navegação
 * dentro do app, que não recarrega a página nem recria o store.
 */
export function trocarContextoDoCarrinho(contexto: ContextoDoCarrinho) {
  // No servidor o persist não existe: não há localStorage.
  if (!useCart.persist) return;
  const chave = chaveDoCarrinho(contexto);
  if (useCart.persist.getOptions().name === chave) return;
  useCart.persist.setOptions({ name: chave });
  void useCart.persist.rehydrate();
}

/**
 * Se o carrinho guardado no navegador já foi lido.
 *
 * O HTML do servidor nasce com o carrinho vazio, porque o servidor não vê o
 * localStorage. Tela que decide algo por "carrinho vazio" (o checkout manda
 * de volta ao cardápio) precisa esperar isto, senão pisca "seu carrinho está
 * vazio" para quem tem itens. No servidor e na hidratação do React a resposta
 * é sempre `false`, o que mantém o HTML igual dos dois lados.
 */
export function useCarrinhoHidratado(): boolean {
  return useSyncExternalStore(
    (avisar) => useCart.persist?.onFinishHydration(() => avisar()) ?? (() => {}),
    () => useCart.persist?.hasHydrated() ?? false,
    () => false
  );
}
