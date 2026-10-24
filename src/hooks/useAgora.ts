"use client";

import { useSyncExternalStore } from "react";

/**
 * Relógio compartilhado, em tiques de 30s.
 *
 * O tempo de espera do card da cozinha era calculado só no render, então
 * parava enquanto nada mudasse no quadro: um pedido esquecido mostrava "3min"
 * por meia hora. Um timer por card resolveria com 40 intervalos num quadro
 * cheio; aqui é um só, ligado enquanto houver alguém olhando.
 */
const TIQUE_MS = 30_000;

let agora = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const ouvintes = new Set<() => void>();

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  if (!timer) {
    agora = Date.now();
    timer = setInterval(() => {
      agora = Date.now();
      ouvintes.forEach((o) => o());
    }, TIQUE_MS);
  }
  return () => {
    ouvintes.delete(ouvinte);
    if (ouvintes.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const ler = () => agora;

export function useAgora(): number {
  return useSyncExternalStore(assinar, ler, ler);
}
