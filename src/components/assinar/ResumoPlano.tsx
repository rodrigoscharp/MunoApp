"use client";

import type { PlanoTenant } from "@prisma/client";
import {
  type Ciclo,
  PLANO_LABELS,
  formatarBRL,
  precoDoCiclo,
} from "@/lib/plans";

/**
 * O cabeçalho da compra em /assinar: o que se está comprando e por quanto.
 *
 * Não é dono de estado nenhum. O ciclo mora no Checkout, que precisa dele para
 * montar a URL e para enviar no submit; aqui o toggle só reporta a intenção.
 * Duas fontes para o mesmo ciclo dariam preço na tela diferente do preço
 * cobrado.
 *
 * Só o cabeçalho da compra: plano, ciclo e preço. O que o plano entrega vive
 * no ReforcoPlano, separado para poder descer para depois do formulário no
 * celular — junto, empurrava o primeiro campo para baixo da dobra.
 *
 * Preço e label saem de plans.ts, cruzado com a landing por plans.test.ts.
 */
export function ResumoPlano({
  plano,
  ciclo,
  onCicloChange,
}: {
  plano: PlanoTenant;
  ciclo: Ciclo;
  onCicloChange: (ciclo: Ciclo) => void;
}) {
  const anual = ciclo === "ANUAL";

  return (
    <aside>
      <div className="rounded-3xl border border-neutral-200/80 bg-white p-5 sm:p-7 shadow-[0_1px_2px_rgba(30,61,47,0.04),0_12px_32px_-12px_rgba(30,61,47,0.14)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-forest/60">
          Você está assinando
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-forest-dark">
          {PLANO_LABELS[plano]}
        </h1>

        {/* O toggle vive junto do preço porque é o preço que ele muda. Longe
            dele, virava um controle que a pessoa não associa ao número. */}
        <div className="mt-5 inline-flex rounded-full bg-forest-light p-1">
          {(
            [
              { valor: "MENSAL" as const, label: "Mensal" },
              { valor: "ANUAL" as const, label: "Anual" },
            ]
          ).map((opcao) => (
            <button
              key={opcao.valor}
              type="button"
              onClick={() => onCicloChange(opcao.valor)}
              aria-pressed={ciclo === opcao.valor}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                ciclo === opcao.valor
                  ? "bg-white text-forest-dark shadow-sm"
                  : "text-forest/70 hover:text-forest-dark"
              }`}
            >
              {opcao.label}
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-baseline gap-1.5">
          <span className="text-3xl sm:text-4xl font-black tracking-tight text-brand">
            R$ {formatarBRL(precoDoCiclo(plano, ciclo))}
          </span>
          <span className="text-sm font-medium text-neutral-400">
            {anual ? "/ano" : "/mês"}
          </span>
        </div>

        {anual && (
          <p className="mt-2 rounded-xl bg-brand-light px-3 py-2 text-xs font-medium text-brand-dark">
            Equivale a 11 mensalidades — um mês grátis pelo compromisso anual.
          </p>
        )}

      </div>
    </aside>
  );
}
