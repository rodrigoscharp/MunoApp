"use client";

import { useEffect } from "react";
import Link from "next/link";

// Fica dentro do layout do painel: a barra lateral continua de pé, e o dono
// pode ir para outra tela sem recarregar. Sem este arquivo o erro subia até
// src/app/error.tsx, que tira o painel inteiro e manda "voltar ao cardápio",
// destino errado para quem estava gerenciando.
export default function AdminError({
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
      <h2 className="text-2xl font-bold text-neutral-900 mb-2">Algo deu errado</h2>
      <p className="text-neutral-500 text-sm mb-6 max-w-sm">
        Esta tela não carregou. Tente novamente ou volte para o início do painel.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => retry()}
          className="px-4 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition"
        >
          Tentar novamente
        </button>
        <Link
          href="/adm"
          className="px-4 py-2 bg-white border border-neutral-200 text-neutral-700 text-sm font-medium rounded-lg hover:bg-neutral-50 transition"
        >
          Voltar ao painel
        </Link>
      </div>
    </div>
  );
}
