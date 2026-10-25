"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/hooks/useCart";
import { triggerCartFly } from "@/components/menu/CartFlyAnimation";
import { AddToCartModal } from "@/components/menu/AddToCartModal";
import type { ItemDaVitrine } from "@/components/loja/tipos";

/**
 * Dona da folha do produto. A mesma folha abre do banner, da fileira de mais
 * pedidos, da busca e das seções; com o estado aqui, há uma folha só na página
 * em vez de uma por card, e cada ponto de entrada só chama `abrir`.
 *
 * `origem` é o botão que abriu a folha: é de lá que a partícula sai para a
 * sacola quando o item entra.
 */
interface ContextoDaFolha {
  abrir: (item: ItemDaVitrine, origem?: HTMLElement | null) => void;
  restaurantOpen: boolean;
}

const Contexto = createContext<ContextoDaFolha | null>(null);

/** Null fora de um ProvedorDaFolha: o ProductCard então cuida da própria folha. */
export function useFolhaDoProduto(): ContextoDaFolha | null {
  return useContext(Contexto);
}

/**
 * O selo da folha: "O mais pedido" para o primeiro vendido, "Mais pedido" para
 * os outros vendidos, nada para o enchimento da fileira nem para o resto do
 * cardápio.
 */
export function seloDeMaisPedido(
  id: string,
  maisPedidos: Pick<ItemDaVitrine, "id">[],
  vendidos: number
): string | undefined {
  const posicao = maisPedidos.findIndex((m) => m.id === id);
  if (posicao < 0 || posicao >= vendidos) return undefined;
  return posicao === 0 ? "O mais pedido" : "Mais pedido";
}

export function ProvedorDaFolha({
  children,
  restaurantOpen,
  maisPedidos = [],
  vendidos = 0,
}: {
  children: React.ReactNode;
  restaurantOpen: boolean;
  /** A fileira de "Mais pedidos". Alimenta o "Combina com" e o selo. */
  maisPedidos?: ItemDaVitrine[];
  /**
   * Quantos dos primeiros de `maisPedidos` venderam de verdade. Só eles
   * ganham selo: o resto completa a fileira e não é "mais pedido" de nada.
   */
  vendidos?: number;
}) {
  const addItem = useCart((s) => s.addItem);
  const [aberto, setAberto] = useState<{ item: ItemDaVitrine; origem: HTMLElement | null } | null>(null);

  const abrir = useCallback(
    (item: ItemDaVitrine, origem?: HTMLElement | null) => {
      // Fechado ou indisponível não abre: é o mesmo bloqueio do botão do card,
      // repetido aqui para valer em todo ponto de entrada.
      if (!restaurantOpen || !item.available) return;
      setAberto({ item, origem: origem ?? null });
    },
    [restaurantOpen]
  );

  const valor = useMemo(() => ({ abrir, restaurantOpen }), [abrir, restaurantOpen]);

  function confirmar(notes: string, quantity: number) {
    if (!aberto) return;
    const { item, origem } = aberto;
    addItem(
      { id: item.id, name: item.name, price: item.price, imageUrl: item.imageUrl, notes: notes || undefined },
      quantity
    );
    if (origem?.isConnected) triggerCartFly(origem);
    setAberto(null);
  }

  function adicionarCombinacao(item: ItemDaVitrine, origem: HTMLElement) {
    addItem({ id: item.id, name: item.name, price: item.price, imageUrl: item.imageUrl }, 1);
    triggerCartFly(origem);
    toast.success(`${item.name} foi para a sacola`);
  }

  const item = aberto?.item;
  const selo = item ? seloDeMaisPedido(item.id, maisPedidos, vendidos) : undefined;

  return (
    <Contexto.Provider value={valor}>
      {children}
      {item && (
        <AddToCartModal
          key={item.id}
          item={item}
          selo={selo}
          combinaCom={maisPedidos.filter((m) => m.id !== item.id).slice(0, 2)}
          onAdicionarCombinacao={adicionarCombinacao}
          onConfirm={confirmar}
          onClose={() => setAberto(null)}
        />
      )}
    </Contexto.Provider>
  );
}
