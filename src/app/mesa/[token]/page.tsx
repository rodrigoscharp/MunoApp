import Link from "next/link";
import { UtensilsCrossed, ArrowRight } from "lucide-react";

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
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center gap-6">
      <div className="w-20 h-20 rounded-full bg-brand flex items-center justify-center shadow-lg">
        <UtensilsCrossed size={36} className="text-white" />
      </div>

      <div>
        <h1 className="text-3xl font-black text-neutral-900 tracking-tight mb-2">
          Bem-vindo!
        </h1>
        <p className="text-neutral-500 text-base max-w-xs">
          Explore o cardápio, adicione o que quiser e confirme o pedido quando estiver pronto.
        </p>
        <p className="text-neutral-400 text-sm mt-2">
          O pagamento é feito no balcão ao final.
        </p>
      </div>

      <Link
        href={`/mesa/${token}/cardapio`}
        className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white font-semibold px-8 py-3.5 rounded-xl transition shadow-md"
      >
        Ver Cardápio
        <ArrowRight size={18} />
      </Link>
    </div>
  );
}
