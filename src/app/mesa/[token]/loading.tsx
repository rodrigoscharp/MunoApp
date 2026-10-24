// Cardápio da mesa: categorias e grade de pratos, como o loading de (client).
// O cabeçalho com o número da mesa vem do layout e já está na tela.
export default function MesaLoading() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex gap-2 py-3 mb-6 overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-8 w-20 rounded-full bg-neutral-100 animate-pulse flex-shrink-0"
          />
        ))}
      </div>

      <div className="h-6 w-32 bg-neutral-200 rounded animate-pulse mb-4" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
            <div className="h-32 bg-neutral-100 animate-pulse" />
            <div className="p-4 space-y-2">
              <div className="h-4 bg-neutral-100 rounded animate-pulse w-3/4" />
              <div className="h-3 bg-neutral-100 rounded animate-pulse w-full" />
              <div className="h-4 w-16 bg-neutral-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
