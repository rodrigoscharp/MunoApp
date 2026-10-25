"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Raminho } from "@/components/loja/Raminho";
import { botaoBrasa, kicker } from "@/components/loja/estilos";
import { precoCurto } from "@/components/loja/preco";
import { useFolhaDoProduto } from "@/components/loja/FolhaDoProduto";
import type { ItemDaVitrine } from "@/components/loja/tipos";

/**
 * O banner do topo: o item mais pedido da casa, ou o que o dono escolheu no
 * painel, com "Pedir agora" abrindo a folha do produto. Qual item e qual
 * chamada é decisão de src/lib/loja/banner.ts; aqui é só o desenho.
 *
 * Com foto sem fundo (`recorte`), o lanche "sai" do banner, grande e sem
 * moldura, como no mockup. Sem ela, a foto comum vai numa moldura
 * arredondada: mistura "multiplicar" sobre foto com fundo de cor tingiria o
 * banner inteiro.
 */
export function BannerDestaque({
  item,
  recorte = null,
  kickerTexto = "O mais pedido",
}: {
  item: ItemDaVitrine;
  /** A foto do item sem fundo (MenuItem.imagemRecortadaUrl). */
  recorte?: string | null;
  kickerTexto?: string;
}) {
  const folha = useFolhaDoProduto();
  const aberto = folha?.restaurantOpen ?? true;

  return (
    <section
      aria-label="Destaque"
      className="relative min-h-[172px] overflow-hidden rounded-[24px] bg-loja-pessego sm:min-h-[200px]"
    >
      <Raminho className="absolute -top-4 left-[38%] h-32 w-32 text-[#C9A685] opacity-80" />

      {recorte ? (
        <div className="pointer-events-none absolute -right-8 top-1/2 h-[210px] w-[210px] -translate-y-1/2 sm:right-0 sm:h-[250px] sm:w-[250px]">
          <Image
            src={recorte}
            alt={item.name}
            fill
            sizes="250px"
            loading="eager"
            fetchPriority="high"
            // Sombra que segue o contorno do lanche, e não uma caixa: é ela
            // que faz a foto recortada parecer apoiada no banner.
            className="object-contain drop-shadow-[0_18px_22px_rgba(74,48,28,0.35)]"
          />
        </div>
      ) : item.imageUrl && (
        <div className="absolute -right-3 top-1/2 h-[150px] w-[150px] -translate-y-1/2 rotate-[4deg] overflow-hidden rounded-[26px] bg-loja-pessego-claro shadow-loja-alta sm:right-6 sm:h-[176px] sm:w-[176px]">
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            sizes="176px"
            // O banner é a primeira imagem grande da página: candidato a LCP.
            loading="eager"
            fetchPriority="high"
            className="object-cover"
          />
        </div>
      )}

      <div className={`relative flex flex-col gap-2 p-[18px] sm:p-6 ${recorte || item.imageUrl ? "max-w-[58%]" : ""}`}>
        <span className={`${kicker} text-[#6A3A1E]`}>{kickerTexto}</span>
        <h2 className="manchete text-[2.1rem] text-forest-dark sm:text-[2.6rem]">
          <span className="line-clamp-2">{item.name}</span>
          <span className="block">por {precoCurto(item.price)}</span>
        </h2>
        <button
          type="button"
          onClick={(e) => folha?.abrir(item, e.currentTarget)}
          disabled={!aberto || !item.available}
          className={`${botaoBrasa} mt-1 h-11 self-start px-4 text-[13px]`}
        >
          {aberto ? "Pedir agora" : "Fechado agora"}
          {aberto && <ArrowRight size={15} strokeWidth={2.6} aria-hidden="true" />}
        </button>
      </div>
    </section>
  );
}
