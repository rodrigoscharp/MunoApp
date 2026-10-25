import Link from "next/link";
import { UtensilsCrossed, ArrowRight } from "lucide-react";
import { botaoBrasa, cartao, kicker } from "@/components/loja/estilos";
import { Raminho } from "@/components/loja/Raminho";

/**
 * Boas-vindas do QR da mesa.
 *
 * Componente de servidor: a mesa já foi validada pelo layout, que também a
 * guarda na aba (MesaDaAba). Antes esta tela era de cliente e buscava a mesma
 * mesa de novo em /api/tables/token só para guardá-la.
 *
 * A tela fica, em vez de um redirect direto ao cardápio: é a primeira coisa
 * que o cliente vê ao ler o QR, e tirá-la é decisão de produto, não conserto.
 */
export default async function MesaLandingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className={`${cartao} relative w-full max-w-sm overflow-hidden px-6 pb-8 pt-10 text-center`}>
        <Raminho className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 text-[#C9A685]" />
        <Raminho className="pointer-events-none absolute -bottom-10 -left-10 h-28 w-28 rotate-180 text-[#C9A685] opacity-60" />

        <div className="relative flex flex-col items-center gap-5">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-loja-pessego">
            <UtensilsCrossed size={34} aria-hidden="true" className="text-loja-preco" />
          </span>

          <div>
            <p className={`${kicker} text-loja-preco`}>Pedido na mesa</p>
            <h1 className="manchete mt-2 text-[52px] text-forest-dark">Bem-vindo!</h1>
            <p className="mx-auto mt-3 max-w-xs text-base leading-relaxed text-loja-tinta-2">
              Explore o cardápio, adicione o que quiser e confirme o pedido quando estiver pronto.
            </p>
          </div>

          <Link
            href={`/mesa/${token}/cardapio`}
            className={`${botaoBrasa} h-14 w-full text-[15px]`}
          >
            Ver cardápio
            <ArrowRight size={18} aria-hidden="true" />
          </Link>

          <p className="rounded-full bg-loja-pessego-claro px-4 py-2 text-[13px] font-bold text-[#6A3A1E]">
            O pagamento é feito no balcão ao final.
          </p>
        </div>
      </div>
    </div>
  );
}
