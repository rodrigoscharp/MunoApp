import Image from "next/image";
import { imagemOtimizavel } from "@/lib/imagem-otimizavel";
import type { RestaurantInfo } from "@/lib/restaurant";

/**
 * O logo padrão do cadastro (SEM_CADASTRO em src/lib/restaurant.ts). É o da
 * Muno, não o do restaurante: com ele, a loja mostra o nome do restaurante em
 * manchete em vez do logo de outra empresa.
 */
const LOGO_PADRAO = "/munowbg.png";

export function temLogoProprio(logoUrl: string): boolean {
  return !!logoUrl && logoUrl !== LOGO_PADRAO;
}

/**
 * A marca do restaurante no topo, no rodapé e no cabeçalho da mesa: o logo,
 * se ele tem um, ou o nome em manchete terracota.
 */
export function MarcaDoRestaurante({
  info,
  tamanho = "grande",
  prioridade = false,
}: {
  info: Pick<RestaurantInfo, "name" | "logoUrl">;
  tamanho?: "grande" | "pequena";
  prioridade?: boolean;
}) {
  if (temLogoProprio(info.logoUrl)) {
    return (
      <Image
        src={info.logoUrl}
        alt={info.name}
        width={180}
        height={68}
        className={`${tamanho === "grande" ? "h-11 md:h-12" : "h-9"} w-auto object-contain`}
        loading={prioridade ? "eager" : "lazy"}
        fetchPriority={prioridade ? "high" : undefined}
        unoptimized={!imagemOtimizavel(info.logoUrl)}
      />
    );
  }
  return (
    <span
      className={`manchete block text-brand ${tamanho === "grande" ? "text-[2.1rem] md:text-[2rem]" : "text-[1.6rem]"}`}
    >
      {info.name || "Cardápio"}
    </span>
  );
}
