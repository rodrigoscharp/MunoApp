import Link from "next/link";

export function MesaIndisponivel() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <h2 className="text-xl font-bold text-neutral-900 mb-2">
        Pedido por mesa indisponível
      </h2>
      <p className="text-neutral-500 text-sm mb-6">
        Este restaurante não está usando pedido por mesa no momento. Você
        ainda pode pedir pelo cardápio normal.
      </p>
      <Link
        href="/"
        className="px-5 py-2.5 bg-brand hover:bg-brand-dark text-white text-sm font-semibold rounded-xl transition"
      >
        Ver cardápio
      </Link>
    </div>
  );
}
