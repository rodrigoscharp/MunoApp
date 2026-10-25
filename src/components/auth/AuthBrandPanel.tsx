import Image from "next/image";
import { imagemOtimizavel } from "@/lib/imagem-otimizavel";
import { MapPin } from "lucide-react";
import { Raminho } from "@/components/loja/Raminho";
import { kicker } from "@/components/loja/estilos";
import { LOGO_PADRAO } from "@/lib/pwa/logo-do-tenant";
import type { RestaurantInfo } from "@/lib/restaurant";

/**
 * O painel de marca das telas de login, cadastro e recuperação de senha.
 *
 * Existe para que os dois lados leiam o MESMO restaurante. Até 18/08/2026 cada
 * tela trazia "Muno Food Restaurante" e "Rua Paraty 1772, Ubatuba-SP" escritos
 * no JSX: todo cliente de todo restaurante criava conta olhando o nome e o
 * endereço de uma hamburgueria em Ubatuba. É a mesma falha que tirou o
 * restaurante do seed do domínio raiz (ver AGENTS.md), sobrevivendo em dois
 * arquivos onde ninguém olhou.
 *
 * O endereço só aparece quando existe. Tenant recém-provisionado ainda não
 * preencheu o cadastro, e uma linha com o pino e nada ao lado é pior que
 * nenhuma linha.
 *
 * Sem logo próprio (`LOGO_PADRAO`, o da Muno), o nome entra em manchete
 * terracota no lugar da imagem: o cliente do restaurante não conhece a Muno,
 * e o logo dela aqui diria que a conta é de outro lugar.
 *
 * No celular o painel encolhe para uma faixa no topo, com nome e frase; a
 * descrição e o endereço ficam só na coluna do desktop, para o formulário
 * caber acima da dobra.
 */
export function AuthBrandPanel({
  restaurantInfo,
  descricao,
}: {
  restaurantInfo: RestaurantInfo;
  descricao: string;
}) {
  const logo = restaurantInfo.logoUrl?.trim();
  const temLogo = Boolean(logo) && logo !== LOGO_PADRAO;

  // Só a partir do lg. Abaixo disso o cabeçalho da loja já mostra o nome e a
  // frase logo acima, e o painel repetia o mesmo nome duas vezes na tela do
  // celular antes de o formulário começar.
  return (
    <div className="relative hidden overflow-hidden bg-loja-pessego lg:flex lg:w-1/2 lg:flex-col lg:items-center lg:justify-center lg:rounded-none lg:p-12">
      <Raminho className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 text-[#C9A685] lg:-right-10 lg:top-10 lg:h-72 lg:w-72" />
      <Raminho className="pointer-events-none absolute -bottom-16 -left-12 hidden h-64 w-64 rotate-180 text-[#C9A685] opacity-70 lg:block" />

      <div className="relative z-10 flex max-w-sm flex-col items-center gap-3 text-center lg:gap-6">
        {temLogo ? (
          <Image
            src={logo}
            alt={restaurantInfo.name}
            width={200}
            height={75}
            className="h-14 w-auto object-contain lg:h-24"
            unoptimized={!imagemOtimizavel(logo)}
          />
        ) : (
          <p className="manchete break-words text-[38px] text-loja-preco lg:text-[64px]">
            {restaurantInfo.name}
          </p>
        )}

        {restaurantInfo.slogan && (
          <p className={`${kicker} text-forest-dark`}>{restaurantInfo.slogan}</p>
        )}

        <p className="hidden text-base leading-relaxed text-loja-tinta lg:block">{descricao}</p>

        {restaurantInfo.address && (
          <div className="hidden w-full items-center justify-center gap-2 border-t border-[#E2C3A6] pt-6 text-sm text-loja-tinta lg:flex">
            <MapPin size={16} aria-hidden="true" className="shrink-0 text-loja-preco" />
            <span>{restaurantInfo.address}</span>
          </div>
        )}
      </div>
    </div>
  );
}
