"use client";

import { useEffect, useRef, useState } from "react";
import { numeroCompacto } from "@/lib/numero-compacto";

/**
 * O número que conta até o valor, como nos cards do Core.
 *
 * Parte do que está na tela, e não do valor anterior da prop: se o valor muda
 * no meio de uma contagem, ela segue dali em vez de saltar. É também o que faz
 * a contagem sobreviver ao efeito duplo do StrictMode em desenvolvimento, que
 * cancela o primeiro quadro antes de ele pintar.
 */
export function NumeroAnimado({
  valor,
  moeda = false,
  className = "",
}: {
  valor: number;
  moeda?: boolean;
  className?: string;
}) {
  const [exibido, setExibido] = useState(0);
  const naTela = useRef(0);

  useEffect(() => {
    const de = naTela.current;
    const reduzido = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const duracao = reduzido ? 0 : 900;
    const inicio = performance.now();

    let quadro = requestAnimationFrame(function passo(t) {
      const p = duracao === 0 ? 1 : Math.min(1, (t - inicio) / duracao);
      const suave = 1 - Math.pow(1 - p, 3);
      const agora = de + (valor - de) * suave;
      naTela.current = agora;
      setExibido(agora);
      if (p < 1) quadro = requestAnimationFrame(passo);
    });

    return () => cancelAnimationFrame(quadro);
  }, [valor]);

  return (
    <span className={`tabular ${className}`}>
      {numeroCompacto(exibido, moeda)}
    </span>
  );
}
