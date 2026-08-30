import { Suspense } from "react";
import { headers } from "next/headers";
import Image from "next/image";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Letreiro } from "@/components/assinar/Letreiro";
import { getRestaurantInfo } from "@/lib/restaurant";
import { getRequestTenantId } from "@/lib/tenant-request";

/**
 * A mesma tela serve dois caminhos, e eles não merecem o mesmo tratamento.
 *
 * O primeiro acesso (`novo=1`, posto no link por email-boas-vindas.ts) é a
 * continuação direta da tela de obrigado: a pessoa viu o letreiro da casa dela
 * acender e clicou no e-mail. Reencontrar o MESMO letreiro aqui faz das duas
 * telas um momento só, em vez de duas que não se conhecem. A recuperação de
 * senha fica com o painel de sempre — ali não há casa nova para anunciar.
 *
 * Server Component por dois motivos: o nome do restaurante (que mora no
 * Setting do tenant) e o endereço, lido do próprio host da requisição, que é
 * exatamente o domínio do letreiro e dispensa consulta. O formulário continua
 * client, no componente ao lado, porque depende de query string e de estado.
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
  // O host desta requisição É o endereço do restaurante: a página só existe
  // sob o subdomínio dele.
  const endereco = (await headers()).get("host") ?? "";

  return (
    <div className="min-h-screen flex">
      {/* Painel lateral, só no desktop. No primeiro acesso o conteúdo dele
          também aparece no celular, como card acima do formulário — ver
          abaixo. Some aqui para não repetir. */}
      <div
        className={`hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 relative overflow-hidden ${
          primeiroAcesso ? "bg-forest-dark" : "bg-brand"
        }`}
      >
        {!primeiroAcesso && (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-brand via-brand to-brand-dark opacity-90" />
            <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-white/5" />
            <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-white/5" />
          </>
        )}
        <div className="relative z-10 flex flex-col items-center text-center gap-6 max-w-sm">
          <Image
            src="/munowbg.png"
            alt="Muno Food"
            width={200}
            height={75}
            className="h-20 w-auto object-contain brightness-0 invert"
          />
          {primeiroAcesso ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
                Sua casa está no ar
              </p>
              <div className="mt-4">
                <Letreiro endereco={endereco} />
              </div>
              <p className="mt-8 text-white/70 text-base leading-relaxed">
                Falta um passo: criar sua senha. É com ela que você entra no
                painel e começa a montar seu cardápio.
              </p>
            </div>
          ) : (
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Nova senha</h1>
              <p className="text-white/70 text-base leading-relaxed">
                Escolha uma senha segura para proteger sua conta.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-neutral-50">
        <div className="w-full max-w-sm">
          {/* O letreiro no celular. Antes o painel inteiro sumia abaixo de lg,
              e quem abria o e-mail no telefone — a maioria — perdia a única
              parte da tela que celebrava a compra. */}
          {primeiroAcesso && (
            <div className="mb-8 rounded-3xl bg-forest-dark px-6 py-8 text-center lg:hidden">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
                Sua casa está no ar
              </p>
              <div className="mt-3">
                <Letreiro endereco={endereco} />
              </div>
            </div>
          )}

          <Suspense
            fallback={
              <div className="text-neutral-400 text-sm">Carregando...</div>
            }
          >
            <ResetPasswordForm nomeRestaurante={info.name} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
