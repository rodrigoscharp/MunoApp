import Image from "next/image";
import { MapPin } from "lucide-react";
import type { RestaurantInfo } from "@/lib/restaurant";

/**
 * O painel de marca das telas de login e cadastro.
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
 */
export function AuthBrandPanel({
  restaurantInfo,
  descricao,
}: {
  restaurantInfo: RestaurantInfo;
  descricao: string;
}) {
  return (
    <div className="hidden lg:flex lg:w-1/2 bg-brand flex-col items-center justify-center p-12 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-brand via-brand to-brand-dark opacity-90" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-white/5" />
      <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-white/5" />

      <div className="relative z-10 flex flex-col items-center text-center gap-6 max-w-sm">
        <Image
          src={restaurantInfo.logoUrl}
          alt={restaurantInfo.name}
          width={200}
          height={75}
          className="h-20 w-auto object-contain brightness-0 invert"
          unoptimized={restaurantInfo.logoUrl.startsWith("http")}
        />
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{restaurantInfo.name}</h1>
          <p className="text-white/70 text-base leading-relaxed">{descricao}</p>
        </div>
        {restaurantInfo.address && (
          <div className="w-full border-t border-white/20 pt-6 flex flex-col gap-3 text-white/70 text-sm">
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-white/50 shrink-0" />
              <span>{restaurantInfo.address}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
