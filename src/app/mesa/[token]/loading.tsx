import { cartao } from "@/components/loja/estilos";

// Cardápio da mesa: categorias e grade de pratos, como o loading de (client).
// O cabeçalho com o número da mesa vem do layout e já está na tela.
export default function MesaLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex gap-2 overflow-hidden py-3">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-[66px] w-[62px] flex-shrink-0 animate-pulse rounded-2xl bg-loja-papel"
          />
        ))}
      </div>

      <div className="mb-4 h-6 w-32 animate-pulse rounded-full bg-loja-linha" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className={`${cartao} overflow-hidden p-2.5`}>
            <div className="h-32 animate-pulse rounded-2xl bg-loja-pessego-claro" />
            <div className="space-y-2 p-2">
              <div className="h-4 w-3/4 animate-pulse rounded-full bg-loja-creme" />
              <div className="h-3 w-full animate-pulse rounded-full bg-loja-creme" />
              <div className="h-4 w-16 animate-pulse rounded-full bg-loja-creme" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
