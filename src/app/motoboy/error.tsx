"use client";

import { useEffect } from "react";
import Link from "next/link";

// Voltar leva à lista de corridas, que é a tela inicial do motoboy. O
// src/app/error.tsx mandava para o cardápio do restaurante, onde o
// entregador não tem o que fazer.
export default function MotoboyError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
      <h2 className="text-xl font-bold text-white mb-2">Algo deu errado</h2>
      <p className="text-neutral-400 text-sm mb-6 max-w-sm">
        Esta tela não carregou. Tente novamente ou volte para as entregas.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => retry()}
          className="px-4 py-2.5 bg-brand hover:bg-brand-dark text-white text-sm font-semibold rounded-lg transition"
        >
          Tentar novamente
        </button>
        <Link
          href="/motoboy/pedidos"
          className="px-4 py-2.5 bg-neutral-800 border border-neutral-700 text-neutral-200 text-sm font-semibold rounded-lg hover:bg-neutral-700 transition"
        >
          Ver entregas
        </Link>
      </div>
    </div>
  );
}
