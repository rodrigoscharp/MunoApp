import { Suspense } from "react";
import { headers } from "next/headers";
import Image from "next/image";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Letreiro } from "@/components/assinar/Letreiro";
import { AuthBrandPanel } from "@/components/auth/AuthBrandPanel";
import { Raminho } from "@/components/loja/Raminho";
import { cartao, kicker } from "@/components/loja/estilos";
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

  // Recuperação de senha é coisa do cliente do restaurante, e leva a marca
  // dele (AuthBrandPanel). O primeiro acesso é do dono que acabou de comprar a
  // Muno, e fica com o letreiro em floresta e o logo da plataforma.
  const formulario = (
    <div className={`${cartao} w-full max-w-sm p-6 sm:p-8`}>
      <Suspense
        fallback={<div className="text-sm text-loja-tinta-2">Carregando...</div>}
      >
        <ResetPasswordForm nomeRestaurante={info.name} />
      </Suspense>
    </div>
  );

  if (!primeiroAcesso) {
    return (
      <div className="flex min-h-screen flex-col lg:flex-row">
        <AuthBrandPanel
          restaurantInfo={info}
          descricao="Escolha uma senha segura para proteger sua conta."
        />
        <div className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 sm:px-6 lg:items-center lg:py-12">
          {formulario}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Painel lateral, só no desktop. No celular o conteúdo dele aparece
          como card acima do formulário — ver abaixo. Some aqui para não
          repetir. */}
      <div className="relative hidden flex-col items-center justify-center overflow-hidden bg-forest-dark p-12 lg:flex lg:w-1/2">
        <Raminho className="pointer-events-none absolute -right-10 top-10 h-72 w-72 text-forest" />
        <div className="relative z-10 flex max-w-sm flex-col items-center gap-6 text-center">
          <Image
            src="/munowbg.png"
            alt="Muno Food"
            width={200}
            height={75}
            className="h-20 w-auto object-contain brightness-0 invert"
          />
          <div>
            <p className={`${kicker} text-[#F2A67F]`}>Sua casa está no ar</p>
            <div className="mt-4">
              <Letreiro endereco={endereco} />
            </div>
            <p className="mt-8 text-base leading-relaxed text-white/80">
              Falta um passo: criar sua senha. É com ela que você entra no
              painel e começa a montar seu cardápio.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 sm:px-6 lg:items-center lg:py-12">
        <div className="w-full max-w-sm">
          {/* O letreiro no celular. Antes o painel inteiro sumia abaixo de lg,
              e quem abria o e-mail no telefone — a maioria — perdia a única
              parte da tela que celebrava a compra. */}
          <div className="relative mb-6 overflow-hidden rounded-[28px] bg-forest-dark px-6 py-8 text-center lg:hidden">
            <Raminho className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 text-forest" />
            <p className={`${kicker} relative text-[#F2A67F]`}>Sua casa está no ar</p>
            <div className="relative mt-3">
              <Letreiro endereco={endereco} />
            </div>
          </div>

          {formulario}
        </div>
      </div>
    </div>
  );
}
