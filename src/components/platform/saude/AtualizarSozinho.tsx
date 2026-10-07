"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Relê a página a cada minuto. Sem realtime de propósito: um minuto de atraso
 * é aceitável numa tela de saúde, e aba escondida não gasta consulta.
 */
export function AtualizarSozinho({ segundos = 60 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, segundos * 1000);
    return () => clearInterval(id);
  }, [router, segundos]);
  return null;
}
