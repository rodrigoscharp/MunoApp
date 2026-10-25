import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { botaoBrasa, cartao } from "@/components/loja/estilos";
import { fontesDaLoja } from "@/lib/loja/fontes";

/**
 * O QR de mesa de um plano sem a função. O layout da mesa devolve esta tela
 * antes de montar o próprio invólucro, então o `.loja` e as fontes vêm aqui.
 */
export function MesaIndisponivel() {
  return (
    <div
      className={`loja ${fontesDaLoja} flex min-h-screen flex-col items-center justify-center px-4 py-10 text-center`}
    >
      <div className={`${cartao} flex w-full max-w-sm flex-col items-center px-6 py-10`}>
        <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-loja-pessego">
          <UtensilsCrossed size={28} aria-hidden="true" className="text-loja-preco" />
        </span>
        <h2 className="manchete mb-3 text-[34px] text-forest-dark">
          Pedido por mesa indisponível
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-loja-tinta-2">
          Este restaurante não está usando pedido por mesa no momento. Você
          ainda pode pedir pelo cardápio normal.
        </p>
        <Link href="/" className={`${botaoBrasa} h-12 text-sm`}>
          Ver cardápio
        </Link>
      </div>
    </div>
  );
}
