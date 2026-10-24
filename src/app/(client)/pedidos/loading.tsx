// O título fica de verdade, não em esqueleto: a pessoa clicou em "Meus
// pedidos" e o que ela precisa saber primeiro é que chegou no lugar certo.
import { ShoppingBag } from "lucide-react";

export default function PedidosLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <ShoppingBag size={22} className="text-brand" />
        <h1 className="text-2xl font-bold text-neutral-900">Meus Pedidos</h1>
      </div>

      <div className="h-3 w-28 bg-neutral-200 rounded animate-pulse mb-3" />
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 bg-neutral-100 rounded animate-pulse" />
              <div className="h-5 w-20 bg-neutral-100 rounded-full animate-pulse" />
            </div>
            <div className="h-3 w-3/4 bg-neutral-100 rounded animate-pulse" />
            <div className="flex items-center justify-between pt-1">
              <div className="h-3 w-24 bg-neutral-100 rounded animate-pulse" />
              <div className="h-4 w-16 bg-neutral-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
