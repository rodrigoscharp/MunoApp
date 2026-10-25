"use client";

import { toast } from "sonner";
import { botaoFloresta } from "@/components/loja/estilos";
import type { CupomDaVitrine } from "@/lib/loja/vitrine";

/**
 * O card do cupom em destaque. "Copiar" põe o código na área de transferência
 * para colar na sacola; sem a API (http, navegador antigo, permissão negada),
 * o aviso diz o código para a pessoa digitar. Nada de diálogo: o toast basta.
 *
 * O título não diz "Primeiro pedido?" como o mockup: o cupom não tem regra de
 * primeira compra, e o card prometeria uma condição que o checkout não aplica.
 */
export function CardCupom({ cupom }: { cupom: CupomDaVitrine }) {
  async function copiar() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("sem clipboard");
      await navigator.clipboard.writeText(cupom.code);
      toast.success(`Cupom ${cupom.code} copiado. É só colar na sacola.`);
    } catch {
      toast(`Use o cupom ${cupom.code} na sacola.`);
    }
  }

  return (
    <section
      aria-label="Cupom"
      className="flex min-h-[66px] items-center gap-3 rounded-[20px] bg-loja-papel p-2.5 shadow-loja"
    >
      <span aria-hidden="true" className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-loja-folha text-forest">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8a2 2 0 0 0 0 4v5h18v-5a2 2 0 0 0 0-4V5H3z" />
          <path d="M14 5v2M14 10.5v1M14 15v2" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-extrabold leading-tight text-forest-dark">
          Cupom da casa: {cupom.beneficio}
        </p>
        <p className="mt-0.5 text-xs text-loja-tinta-2">
          Cupom <span className="font-bold text-loja-tinta">{cupom.code}</span>, direto na sacola
        </p>
      </div>
      <button
        type="button"
        onClick={copiar}
        aria-label={`Copiar cupom ${cupom.code}`}
        className={`${botaoFloresta} h-11 shrink-0 px-4 text-xs`}
      >
        Copiar
      </button>
    </section>
  );
}
