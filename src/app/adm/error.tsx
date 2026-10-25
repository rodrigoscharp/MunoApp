"use client";

import { useEffect } from "react";
import Link from "next/link";
import { botaoBrasa, botaoContorno, cartaoPainel, kicker } from "@/components/painel/estilos";
import { Raminho } from "@/components/loja/Raminho";

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
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className={`${cartaoPainel} relative w-full max-w-md overflow-hidden px-6 py-10 text-center`}>
        <Raminho className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 text-loja-pessego" />
        <span className={`${kicker} text-loja-preco`}>Esta tela não carregou</span>
        <h2 className="manchete mt-2 text-[2.2rem] text-forest-dark">Algo deu errado</h2>
        <p className="mx-auto mt-3 max-w-sm text-[14px] leading-relaxed text-loja-tinta-2">
          Tente de novo ou volte para o início do painel. Seu cardápio continua no ar.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => retry()} className={`${botaoBrasa} h-11 text-[14px]`}>
            Tentar de novo
          </button>
          <Link href="/adm" className={`${botaoContorno} h-11 text-[14px]`}>
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
