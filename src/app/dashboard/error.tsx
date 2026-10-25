"use client";

import { useEffect } from "react";
import { botaoBrasa, botaoContorno } from "@/components/painel/estilos";

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
    <div className="flex min-h-[70vh] items-center justify-center py-8">
      <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-[22px] bg-loja-papel px-6 py-8 text-center shadow-loja">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-loja-preco">Cozinha</span>
        <h2 className="manchete text-[2.6rem] text-forest-dark">O quadro parou</h2>
        <p className="max-w-sm text-[15px] text-loja-tinta-2">
          Ocorreu um erro inesperado. Tente novamente; se continuar, recarregue a página.
        </p>
        <div className="mt-2 flex w-full flex-col gap-2.5 sm:flex-row">
          <button onClick={() => retry()} className={`${botaoBrasa} h-14 flex-1 text-[16px]`}>
            Tentar novamente
          </button>
          {/* <a> e não <Link>: a navegação precisa ser completa, do servidor. */}
          <a href="/dashboard" className={`${botaoContorno} h-14 flex-1 text-[16px]`}>
            Recarregar o quadro
          </a>
        </div>
      </div>
    </div>
  );
}
