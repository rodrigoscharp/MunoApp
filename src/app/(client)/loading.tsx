import { cartao } from "@/components/loja/estilos";

/**
 * O esqueleto do cardápio, nos tons da loja: o creme do fundo e o papel dos
 * cartões, para a troca para a página pronta não piscar em branco.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Category nav skeleton */}
      <div className="sticky top-16 z-30 mb-8 bg-loja-creme">
        <div className="flex gap-2 overflow-hidden py-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-[66px] w-[62px] flex-shrink-0 animate-pulse rounded-2xl bg-loja-papel"
            />
          ))}
        </div>
      </div>

      {/* Category sections skeleton */}
      {[...Array(2)].map((_, s) => (
        <div key={s} className="mb-12">
          <div className="mb-4 h-6 w-32 animate-pulse rounded-full bg-loja-linha" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`${cartao} overflow-hidden p-2.5`}>
                <div className="h-36 animate-pulse rounded-2xl bg-loja-pessego-claro" />
                <div className="space-y-2 p-2">
                  <div className="h-4 w-3/4 animate-pulse rounded-full bg-loja-creme" />
                  <div className="h-3 w-full animate-pulse rounded-full bg-loja-creme" />
                  <div className="flex items-center justify-between pt-1">
                    <div className="h-4 w-16 animate-pulse rounded-full bg-loja-creme" />
                    <div className="h-9 w-9 animate-pulse rounded-full bg-loja-pessego" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
