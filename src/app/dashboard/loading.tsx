// As cinco colunas do quadro, no tema escuro da cozinha. O layout (cabeçalho
// "Cozinha") já está pintado; isto cobre só a área do quadro.
export default function KitchenLoading() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {[...Array(5)].map((_, c) => (
        <div
          key={c}
          className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 min-h-48 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <div className="h-4 w-24 bg-neutral-800 rounded animate-pulse" />
            <div className="h-4 w-6 bg-neutral-800 rounded-full animate-pulse" />
          </div>
          {[...Array(c < 2 ? 2 : 1)].map((_, i) => (
            <div key={i} className="bg-neutral-900 rounded-lg border border-neutral-800 p-3 space-y-2">
              <div className="h-3 w-16 bg-neutral-800 rounded animate-pulse" />
              <div className="h-3 w-full bg-neutral-800 rounded animate-pulse" />
              <div className="h-3 w-2/3 bg-neutral-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
