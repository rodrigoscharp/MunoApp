"use client";

import { useState } from "react";
import { CircleHelp, ShoppingBag, Store, UserRound, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { NumeroAnimado } from "./NumeroAnimado";
import { Sparkline } from "./Sparkline";
import { Variacao } from "./Variacao";

export type KpiDoResumo = {
  chave: string;
  rotulo: string;
  ajuda: string;
  icone: "carteira" | "loja" | "sacola" | "pessoa";
  valor: number;
  moeda: boolean;
  variacao: number | null;
  comparacao: string;
  serie: number[];
};

const ICONES = {
  carteira: Wallet,
  loja: Store,
  sacola: ShoppingBag,
  pessoa: UserRound,
};

/**
 * O cartão "Overview" do Core: uma fileira de indicadores em que um só está
 * aceso.
 *
 * O aceso ganha a coluna larga e o sparkline; os outros ficam esmaecidos e
 * clicáveis. Não é enfeite: quatro sparklines lado a lado viram quatro rabiscos
 * que o olho não compara, e um só, grande, se lê de relance. A troca anima a
 * largura da coluna (flex-grow) e redesenha o traço, para a mudança de foco
 * ser vista e não só acontecer.
 */
export function VisaoGeralKpis({ kpis }: { kpis: KpiDoResumo[] }) {
  const [ativo, setAtivo] = useState(kpis[0]?.chave);

  return (
    <div
      role="tablist"
      aria-label="Indicadores"
      className="grid grid-cols-2 gap-y-9 lg:flex lg:items-stretch"
    >
      {kpis.map((k, i) => {
        const aceso = k.chave === ativo;
        const Icone = ICONES[k.icone];
        const ultimo = i === kpis.length - 1;

        return (
          <button
            key={k.chave}
            type="button"
            role="tab"
            aria-selected={aceso}
            onClick={() => setAtivo(k.chave)}
            className={`group min-w-0 text-left border-console-linha lg:basis-0 transition-[flex-grow,opacity] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-console-tinta rounded-sm ${
              i % 2 === 1 ? "border-l pl-5" : "pr-5"
            } ${i > 0 ? "lg:border-l lg:pl-8" : "lg:border-l-0 lg:pl-0"} ${
              ultimo ? "lg:pr-0" : "lg:pr-8"
            } ${
              aceso
                ? "opacity-100 lg:grow-[1.9]"
                : "opacity-40 hover:opacity-70 lg:grow"
            }`}
          >
            <span className="flex size-14 sm:size-16 items-center justify-center rounded-full bg-console-suave text-console-tinta mb-6 sm:mb-8">
              <Icone size={21} strokeWidth={1.7} aria-hidden />
            </span>

            <span className="flex items-center gap-2 text-[15px] sm:text-[16px] font-medium text-console-tinta">
              {k.rotulo}
              <span title={k.ajuda} className="text-console-mudo">
                <CircleHelp size={18} strokeWidth={1.6} aria-hidden />
                <span className="sr-only">{k.ajuda}</span>
              </span>
            </span>

            <span className="mt-3 flex items-center gap-4 sm:gap-6">
              <span
                className="flex items-start leading-none text-console-tinta min-w-0"
                title={k.moeda ? formatCurrency(k.valor) : String(k.valor)}
              >
                {k.moeda && (
                  <span className="text-[20px] sm:text-[26px] font-semibold mt-[0.2em] mr-1.5 tracking-[-0.02em]">
                    R$
                  </span>
                )}
                <NumeroAnimado
                  valor={k.valor}
                  moeda={k.moeda}
                  className="text-[38px] sm:text-[52px] xl:text-[60px] font-semibold tracking-[-0.045em] whitespace-nowrap"
                />
              </span>
              {aceso && (
                <Sparkline
                  // A chave refaz o traço a cada troca de indicador.
                  key={k.chave}
                  valores={k.serie}
                  className={`hidden sm:block ${
                    k.variacao !== null && k.variacao < 0
                      ? "text-console-alerta"
                      : "text-console-grafico"
                  }`}
                />
              )}
            </span>

            <span className="mt-4 sm:mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <Variacao valor={k.variacao} />
              <span className="text-[13px] sm:text-[14px] text-console-mudo">
                {k.comparacao}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
