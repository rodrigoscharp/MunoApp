// O título fica de verdade, não em esqueleto: a pessoa clicou em "Meus
// pedidos" e o que ela precisa saber primeiro é que chegou no lugar certo.
import { cartao } from "@/components/loja/estilos";
import { TituloDosPedidos } from "./TituloDosPedidos";

export default function PedidosLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <TituloDosPedidos />

      <div className="mb-3 h-3 w-28 animate-pulse rounded-full bg-loja-linha" />
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className={`${cartao} space-y-3 px-5 py-4`}>
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 animate-pulse rounded-full bg-loja-creme" />
              <div className="h-[26px] w-20 animate-pulse rounded-full bg-loja-pessego-claro" />
            </div>
            <div className="h-3 w-3/4 animate-pulse rounded-full bg-loja-creme" />
            <div className="flex items-center justify-between pt-1">
              <div className="h-3 w-24 animate-pulse rounded-full bg-loja-creme" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-loja-creme" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
