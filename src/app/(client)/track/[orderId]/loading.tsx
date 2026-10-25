// Mesmo esqueleto do OrderTracker: o topo floresta do status, as etapas e o
// recibo. A página consulta o pedido no servidor antes de pintar, e sem isto o
// cliente que acabou de pagar via a tela do checkout parada.
export default function TrackLoading() {
  return (
    <div
      role="status"
      aria-label="Carregando o pedido"
      className="mx-auto w-full max-w-lg space-y-3 px-4 py-4"
    >
      <div className="rounded-[28px] bg-forest-dark px-5 pb-6 pt-5">
        <div className="h-3 w-28 rounded bg-white/15 motion-safe:animate-pulse" />
        <div className="mt-6 h-3 w-20 rounded bg-white/15 motion-safe:animate-pulse" />
        <div className="mt-3 h-10 w-56 rounded bg-white/15 motion-safe:animate-pulse" />
        <div className="mt-2 h-10 w-40 rounded bg-white/15 motion-safe:animate-pulse" />
        <div className="mt-5 h-9 w-24 rounded bg-white/10 motion-safe:animate-pulse" />
      </div>

      <div className="grid grid-cols-3 gap-y-4 rounded-[20px] bg-loja-papel p-4 shadow-loja sm:grid-cols-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-loja-linha motion-safe:animate-pulse" />
            <div className="h-2.5 w-12 rounded bg-loja-linha motion-safe:animate-pulse" />
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-[20px] bg-loja-papel p-4 shadow-loja">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex justify-between">
            <div className="h-4 w-40 rounded bg-loja-linha motion-safe:animate-pulse" />
            <div className="h-4 w-14 rounded bg-loja-linha motion-safe:animate-pulse" />
          </div>
        ))}
        <div className="flex justify-between border-t border-dashed border-loja-linha pt-3">
          <div className="h-4 w-20 rounded bg-loja-linha motion-safe:animate-pulse" />
          <div className="h-6 w-24 rounded bg-loja-linha motion-safe:animate-pulse" />
        </div>
      </div>
    </div>
  );
}
