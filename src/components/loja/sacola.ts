"use client";

import { create } from "zustand";

/**
 * Quem abre a gaveta da sacola. Ela tem dois botões na tela, e só um aparece
 * de cada vez: o do cabeçalho no desktop e o do meio da barra de baixo no
 * celular. Os dois chamam `abrir()` aqui, e uma gaveta só (MontadorDaSacola)
 * escuta.
 *
 * `montada` existe para o chunk da gaveta ficar fora do bundle do cardápio:
 * quase toda visita olha o cardápio antes de abrir a sacola, e a gaveta só é
 * montada (ainda fechada) no primeiro sinal de intenção, para o chunk já ter
 * chegado no clique e a abertura manter a animação de entrada.
 */
interface EstadoDaSacola {
  aberta: boolean;
  montada: boolean;
  preparar: () => void;
  abrir: () => void;
  fechar: () => void;
}

export const useSacola = create<EstadoDaSacola>()((set) => ({
  aberta: false,
  montada: false,
  preparar: () => set((s) => (s.montada ? s : { montada: true })),
  abrir: () => set({ aberta: true, montada: true }),
  fechar: () => set({ aberta: false }),
}));

/**
 * O atributo que marca um botão de sacola como destino da animação de
 * partícula (ver CartFlyAnimation). Atributo e não id: há dois botões, e um id
 * repetido no documento é HTML inválido.
 */
export const ALVO_DA_SACOLA = "data-alvo-da-sacola";
