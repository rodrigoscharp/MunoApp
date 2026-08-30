import { Suspense } from "react";
import Image from "next/image";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { getRestaurantInfo } from "@/lib/restaurant";
import { getRequestTenantId } from "@/lib/tenant-request";

/**
 * Server Component, e não "use client" como antes, por um motivo só: o nome do
 * restaurante. Ele mora no Setting do tenant e é o que permite receber quem
 * acabou de comprar por "Bem-vindo à Muno, Cantina da Ana" em vez de um
 * genérico. O formulário continua client, no componente ao lado, porque
 * depende de token na query string e de estado.
 *
 * A tela serve os dois caminhos — primeiro acesso e recuperação de senha —, e
 * quem separa é o `novo=1` que email-boas-vindas.ts põe no link.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ novo?: string }>;
}) {
  const { novo } = await searchParams;
  const primeiroAcesso = novo === "1";

  const tenantId = await getRequestTenantId();
  const info = await getRestaurantInfo(tenantId);

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-brand flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand via-brand to-brand-dark opacity-90" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-white/5" />
        <div className="relative z-10 flex flex-col items-center text-center gap-6 max-w-sm">
          <Image
            src="/munowbg.png"
            alt="Muno Food"
            width={200}
            height={75}
            className="h-20 w-auto object-contain brightness-0 invert"
          />
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              {primeiroAcesso ? "Sua casa está no ar." : "Nova senha"}
            </h1>
            <p className="text-white/70 text-base leading-relaxed">
              {primeiroAcesso
                ? "Falta um passo: criar sua senha. É com ela que você entra no painel e começa a montar seu cardápio."
                : "Escolha uma senha segura para proteger sua conta."}
            </p>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-neutral-50">
        <Suspense
          fallback={<div className="text-neutral-400 text-sm">Carregando...</div>}
        >
          <ResetPasswordForm nomeRestaurante={info.name} />
        </Suspense>
      </div>
    </div>
  );
}
