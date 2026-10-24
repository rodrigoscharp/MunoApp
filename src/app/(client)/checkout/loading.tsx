// Duas colunas como o checkout: formulário à esquerda, resumo à direita. Sem
// isto, o toque em "Finalizar" no carrinho parecia não ter respondido, e o
// cliente tocava de novo.
export default function CheckoutLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="h-4 w-36 bg-neutral-100 rounded animate-pulse mb-6" />
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Finalizar Pedido</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-neutral-200 p-5 space-y-3">
              <div className="h-4 w-32 bg-neutral-200 rounded animate-pulse" />
              <div className="h-10 w-full bg-neutral-100 rounded-lg animate-pulse" />
              <div className="h-10 w-full bg-neutral-100 rounded-lg animate-pulse" />
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-3 h-fit">
          <div className="h-4 w-28 bg-neutral-200 rounded animate-pulse" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-3 w-32 bg-neutral-100 rounded animate-pulse" />
              <div className="h-3 w-12 bg-neutral-100 rounded animate-pulse" />
            </div>
          ))}
          <div className="h-11 w-full bg-neutral-200 rounded-xl animate-pulse mt-2" />
        </div>
      </div>
    </div>
  );
}
