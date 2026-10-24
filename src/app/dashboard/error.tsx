"use client";

import { useEffect } from "react";

// O quadro é a única tela da cozinha, então não há "outro lugar" para onde
// voltar: o segundo botão recarrega a página inteira. É o que resolve o erro
// mais comum de um tablet que passa o dia aberto, o pedaço de JavaScript que
// sumiu depois de um deploy, e que o `retry` sozinho não refaz.
export default function KitchenError({
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
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <h2 className="text-2xl font-bold text-white mb-2">O quadro parou</h2>
      <p className="text-neutral-400 text-sm mb-6 max-w-sm">
        Ocorreu um erro inesperado. Tente novamente; se continuar, recarregue a página.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => retry()}
          className="px-4 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition"
        >
          Tentar novamente
        </button>
        {/* <a> e não <Link>: a navegação precisa ser completa, do servidor. */}
        <a
          href="/dashboard"
          className="px-4 py-2 bg-neutral-800 border border-neutral-700 text-neutral-200 text-sm font-medium rounded-lg hover:bg-neutral-700 transition"
        >
          Recarregar o quadro
        </a>
      </div>
    </div>
  );
}
