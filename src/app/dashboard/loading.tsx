// O topo e as cinco colunas do quadro, no desenho da cozinha. O topo é
// estático aqui (sem relógio nem canal): ele só segura o lugar até o quadro
// chegar, para a tela não pular.
export default function KitchenLoading() {
  return (
    <div className="flex flex-col gap-4 pt-4" aria-busy="true">
      <div className="flex h-[72px] items-center rounded-[22px] bg-forest-dark px-5">
        <span className="manchete text-[2.1rem] text-white">Cozinha</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-flow-col sm:grid-cols-none sm:auto-cols-[minmax(17.5rem,1fr)] sm:overflow-x-hidden">
        {[...Array(5)].map((_, c) => (
          <div key={c} className="flex min-h-48 flex-col gap-3 rounded-[24px] bg-[#EFE4D7] p-3">
            <div className="h-1.5 rounded-full bg-loja-linha" />
            <div className="flex items-center justify-between px-1">
              <div className="h-6 w-28 animate-pulse rounded-lg bg-loja-linha" />
              <div className="size-8 animate-pulse rounded-full bg-loja-linha" />
            </div>
            {[...Array(c < 2 ? 2 : 1)].map((_, i) => (
              <div key={i} className="space-y-3 rounded-[20px] bg-loja-papel p-4 shadow-loja">
                <div className="h-6 w-24 animate-pulse rounded-lg bg-loja-creme" />
                <div className="h-4 w-full animate-pulse rounded bg-loja-creme" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-loja-creme" />
                <div className="h-14 w-full animate-pulse rounded-full bg-loja-creme" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
