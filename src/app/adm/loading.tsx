// O esqueleto segue a forma do dashboard novo (cabeçalho, faixa do ao vivo,
// quatro números, gráfico e lateral), nas cores da loja, para a troca não
// pular de layout quando os dados chegam.
const bloco = "animate-pulse rounded-[22px] bg-loja-papel shadow-loja motion-reduce:animate-none";

export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-[18px]">
      <span className="sr-only">Carregando…</span>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-40 animate-pulse rounded-full bg-loja-pessego motion-reduce:animate-none" />
          <div className="h-10 w-72 max-w-full animate-pulse rounded-xl bg-loja-linha motion-reduce:animate-none" />
        </div>
        <div className="h-11 w-72 max-w-full animate-pulse rounded-full bg-loja-linha motion-reduce:animate-none" />
      </div>
      <div className="h-[84px] animate-pulse rounded-[22px] bg-forest-dark/85 motion-reduce:animate-none" />
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className={`${bloco} h-[150px]`} />
        ))}
      </div>
      <div className="grid gap-3.5 lg:grid-cols-3">
        <div className={`${bloco} h-72 lg:col-span-2`} />
        <div className={`${bloco} h-72`} />
      </div>
    </div>
  );
}
