"use client";

import { useEffect } from "react";
import { trocarContextoDoCarrinho, type ContextoDoCarrinho as Contexto } from "@/hooks/useCart";

/**
 * Diz ao carrinho em qual contexto a tela está (delivery ou uma mesa).
 *
 * O carregamento da página já escolhe a chave pela URL; este componente cobre
 * a navegação dentro do app, que troca de layout sem recriar o store. Não
 * renderiza nada.
 */
export function ContextoDoCarrinho({ contexto }: { contexto: Contexto }) {
  useEffect(() => {
    trocarContextoDoCarrinho(contexto);
  }, [contexto]);
  return null;
}
