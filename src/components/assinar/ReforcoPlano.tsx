"use client";

import type { PlanoTenant } from "@prisma/client";
import { PLANO_BENEFICIOS } from "@/lib/plans";

/**
 * O que vem junto no plano, e para onde o pagamento vai.
 *
 * Vive separado do ResumoPlano por causa do celular. Dentro do mesmo card, a
 * lista empurrava o formulário inteiro para baixo da dobra: a pessoa rolava
 * seis bullets e um aviso antes de ver o primeiro campo, no aparelho em que a
 * maioria dos donos abre o link. Separado, o Checkout coloca ele DEPOIS do
 * formulário no celular e na coluna da esquerda no desktop — uma marcação só,
 * ordem diferente.
 *
 * Os benefícios saem de plans.ts, cruzado com a landing por plans.test.ts.
 * Nada de texto de plano escrito à mão aqui.
 */
export function ReforcoPlano({ plano }: { plano: PlanoTenant }) {
  return (
    <div className="rounded-3xl border border-neutral-200/80 bg-white/70 p-5 sm:p-7">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-forest/60">
        O que vem junto
      </p>

      <ul className="mt-4 space-y-2.5">
        {PLANO_BENEFICIOS[plano].map((beneficio) => (
          <li key={beneficio} className="flex gap-2.5 text-sm text-neutral-700">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-forest"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 0 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                clipRule="evenodd"
              />
            </svg>
            {beneficio}
          </li>
        ))}
      </ul>

      <p className="mt-6 flex items-center gap-2 border-t border-neutral-100 pt-5 text-xs text-neutral-500">
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-3.5 w-3.5 flex-shrink-0 text-forest/70"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 1a4 4 0 0 0-4 4v2H5.5A1.5 1.5 0 0 0 4 8.5v8A1.5 1.5 0 0 0 5.5 18h9a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 14.5 7H14V5a4 4 0 0 0-4-4Zm2 6V5a2 2 0 1 0-4 0v2h4Z"
            clipRule="evenodd"
          />
        </svg>
        Pagamento processado pelo Asaas. Você conclui no ambiente seguro deles.
      </p>
    </div>
  );
}
