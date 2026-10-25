/**
 * O esqueleto da vitrine, na mesma ordem dela (busca, banner, categorias,
 * mais pedidos, seções), para a página não pular de lugar quando chega. O
 * cabeçalho e a barra de baixo moram no layout e não somem durante o
 * carregamento.
 */
const bloco = "animate-pulse bg-loja-pessego-claro";

export default function Loading() {
  return (
    <div className="min-h-screen" aria-busy="true">
      <span className="sr-only">Carregando o cardápio…</span>

      <div className="mx-auto max-w-5xl space-y-4 px-4 pb-2 pt-3">
        <div className="h-12 rounded-full bg-loja-papel shadow-loja" />
        <div className={`h-[172px] rounded-[24px] sm:h-[200px] ${bloco}`} />
      </div>

      <div className="mx-auto flex max-w-5xl gap-2 overflow-hidden px-4 py-2.5">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-[64px] w-[68px] shrink-0 rounded-2xl bg-loja-papel shadow-loja" />
        ))}
      </div>

      <div className="mx-auto max-w-5xl px-4 pt-3">
        <div className={`h-5 w-32 rounded-full ${bloco}`} />
        <div className="mt-3 flex gap-2.5 overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-[128px] shrink-0 rounded-[20px] bg-loja-papel p-2 shadow-loja sm:w-[150px]">
              <div className={`aspect-[8/7] rounded-2xl ${bloco}`} />
              <div className={`mt-2 h-3.5 w-3/4 rounded-full ${bloco}`} />
              <div className={`mt-3 h-3.5 w-1/3 rounded-full ${bloco}`} />
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-10 px-4 pb-10 pt-8">
        {[...Array(2)].map((_, s) => (
          <div key={s}>
            <div className={`mb-4 h-7 w-40 rounded-full ${bloco}`} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-[20px] bg-loja-papel p-2 pb-3 shadow-loja">
                  <div className={`aspect-[4/3] rounded-2xl ${bloco}`} />
                  <div className={`mt-2.5 h-4 w-3/4 rounded-full ${bloco}`} />
                  <div className={`mt-2 h-3 w-full rounded-full ${bloco}`} />
                  <div className="mt-3 flex items-center justify-between">
                    <div className={`h-4 w-14 rounded-full ${bloco}`} />
                    <div className={`h-9 w-9 rounded-full ${bloco}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
