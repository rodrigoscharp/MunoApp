"use client";

import { useEffect, useRef } from "react";
import { ALVO_DA_SACOLA } from "@/components/loja/sacola";

export interface FlyEvent {
  fromX: number;
  fromY: number;
}

/**
 * O botão de sacola que está na tela. Há dois (cabeçalho no desktop, barra de
 * baixo no celular), e o escondido por breakpoint tem `display: none`, sem
 * retângulo nenhum: é por isso que ele fica de fora.
 */
export function alvoVisivelDaSacola(): HTMLElement | null {
  const alvos = document.querySelectorAll<HTMLElement>(`[${ALVO_DA_SACOLA}]`);
  for (const alvo of alvos) {
    if (alvo.getClientRects().length > 0) return alvo;
  }
  return null;
}

// Dispara a animação a partir de qualquer componente
export function triggerCartFly(btn: HTMLElement) {
  const rect = btn.getBoundingClientRect();
  const event = new CustomEvent<FlyEvent>("cart-fly", {
    detail: { fromX: rect.left + rect.width / 2, fromY: rect.top + rect.height / 2 },
  });
  window.dispatchEvent(event);
}

export function CartFlyAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onCartFly(e: Event) {
      const { fromX, fromY } = (e as CustomEvent<FlyEvent>).detail;

      // Posição do botão da sacola que está visível
      const cartBtn = alvoVisivelDaSacola();
      if (!cartBtn || !containerRef.current) return;
      const cartRect = cartBtn.getBoundingClientRect();
      const toX = cartRect.left + cartRect.width / 2;
      const toY = cartRect.top + cartRect.height / 2;

      // Cria a partícula
      const dot = document.createElement("span");
      dot.style.cssText = `
        position: fixed;
        left: ${fromX}px;
        top: ${fromY}px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #D4612A;
        box-shadow: 0 0 0 3px #FFFBF6;
        pointer-events: none;
        z-index: 9999;
        transform: translate(-50%, -50%);
        transition: none;
      `;
      document.body.appendChild(dot);

      // Força reflow para garantir que a transição funcione
      dot.getBoundingClientRect();

      dot.style.transition = "left 0.45s cubic-bezier(0.25,0.46,0.45,0.94), top 0.45s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.45s, transform 0.45s";
      dot.style.left = `${toX}px`;
      dot.style.top = `${toY}px`;
      dot.style.transform = "translate(-50%, -50%) scale(0.3)";
      dot.style.opacity = "0";

      setTimeout(() => dot.remove(), 500);
    }

    window.addEventListener("cart-fly", onCartFly);
    return () => window.removeEventListener("cart-fly", onCartFly);
  }, []);

  return <div ref={containerRef} />;
}
