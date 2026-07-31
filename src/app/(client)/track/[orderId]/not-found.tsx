import Link from "next/link";

export default function OrderNotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl font-black text-neutral-200 mb-4">404</p>
      <h2 className="text-lg font-bold text-neutral-900 mb-2">Pedido não encontrado</h2>
      <p className="text-neutral-500 text-sm mb-6">
        Não encontramos este pedido. Se ele é seu, faça login para vê-lo.
      </p>
      <div className="flex items-center gap-3">
        <Link href="/login" className="px-5 py-2.5 bg-brand hover:bg-brand-dark text-white text-sm font-semibold rounded-xl transition">
          Fazer login
        </Link>
        <Link href="/" className="px-5 py-2.5 text-neutral-500 hover:text-neutral-700 text-sm font-semibold transition">
          Voltar ao cardápio
        </Link>
      </div>
    </div>
  );
}
