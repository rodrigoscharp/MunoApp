// Mesmo esqueleto do OrderTracker: o herói escuro do status, a linha do tempo
// e o recibo. A página consulta o pedido no servidor antes de pintar, e sem
// isto o cliente que acabou de pagar via a tela do checkout parada.
export default function TrackLoading() {
  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
      <div className="rounded-3xl p-6 bg-neutral-950">
        <div className="w-16 h-16 rounded-2xl bg-white/10 animate-pulse mb-4" />
        <div className="h-6 w-40 bg-white/15 rounded animate-pulse mb-2" />
        <div className="h-4 w-56 bg-white/10 rounded animate-pulse" />
      </div>

      <div className="bg-white rounded-3xl border border-neutral-200 p-5">
        <div className="flex justify-between">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-neutral-100 animate-pulse" />
              <div className="h-2.5 w-10 bg-neutral-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-neutral-200 p-5 space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex justify-between">
            <div className="h-4 w-40 bg-neutral-100 rounded animate-pulse" />
            <div className="h-4 w-14 bg-neutral-100 rounded animate-pulse" />
          </div>
        ))}
        <div className="pt-3 border-t border-neutral-100 flex justify-between">
          <div className="h-4 w-20 bg-neutral-100 rounded animate-pulse" />
          <div className="h-6 w-24 bg-neutral-200 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}
