import { cartao } from "@/components/loja/estilos";

// Duas colunas como o checkout: formulário à esquerda, resumo à direita. Sem
// isto, o toque em "Finalizar" no carrinho parecia não ter respondido, e o
// cliente tocava de novo.
export default function CheckoutLoading() {
  const bloco = "rounded-full bg-loja-linha animate-pulse";
  return (
    <div className="mx-auto max-w-5xl px-4 pb-12 pt-5">
      <div className="mb-5 flex items-center gap-3">
        <div className="h-11 w-11 shrink-0 rounded-full bg-loja-papel shadow-loja" />
        <h1 className="manchete text-[32px] text-forest-dark md:text-[40px]">Finalizar Pedido</h1>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[minmax(0,1fr)_360px] md:gap-6">
        <div className="space-y-5">
          <div className="h-[52px] w-full rounded-[22px] bg-loja-linha animate-pulse" />
          {[...Array(2)].map((_, i) => (
            <div key={i} className={`${cartao} space-y-3 p-4`}>
              <div className={`${bloco} h-4 w-32`} />
              <div className="h-12 w-full rounded-2xl bg-loja-creme animate-pulse" />
              <div className="h-12 w-full rounded-2xl bg-loja-creme animate-pulse" />
            </div>
          ))}
          <div className="grid grid-cols-3 gap-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-loja-papel shadow-loja animate-pulse" />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className={`${cartao} space-y-3 p-4`}>
            <div className={`${bloco} h-4 w-28`} />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-[14px] bg-loja-pessego-claro animate-pulse" />
                <div className={`${bloco} h-3 flex-1`} />
                <div className={`${bloco} h-3 w-12`} />
              </div>
            ))}
          </div>
          <div className="h-14 w-full rounded-full bg-loja-pessego animate-pulse" />
        </div>
      </div>
    </div>
  );
}
