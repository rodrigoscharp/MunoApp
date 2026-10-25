"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Raminho } from "@/components/loja/Raminho";
import { botaoBrasa, kicker } from "@/components/loja/estilos";
import { precoCurto } from "@/components/loja/preco";
import { useFolhaDoProduto } from "@/components/loja/FolhaDoProduto";
import type { ItemDaVitrine } from "@/components/loja/tipos";

/**
 * O banner do topo: o item mais pedido da casa, com "Pedir agora" abrindo a
 * folha do produto. Não há campo de banner no cadastro; ele sai do que o
 * restaurante já vende (ver src/lib/loja/vitrine.ts).
 *
 * A foto fica numa moldura arredondada, e não solta com mistura "multiplicar"
 * como no mockup: o mockup usava foto de fundo branco, e foto de restaurante
 * chega com fundo de qualquer cor, que a mistura tingiria.
 */
export function BannerDestaque({ item, kickerTexto = "O mais pedido" }: { item: ItemDaVitrine; kickerTexto?: string }) {
  const folha = useFolhaDoProduto();
  const aberto = folha?.restaurantOpen ?? true;

  return (
    <section
      aria-label="Destaque"
      className="relative min-h-[172px] overflow-hidden rounded-[24px] bg-loja-pessego sm:min-h-[200px]"
    >
      <Raminho className="absolute -top-4 left-[38%] h-32 w-32 text-[#C9A685] opacity-80" />

      {item.imageUrl && (
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

      <div className={`relative flex flex-col gap-2 p-[18px] sm:p-6 ${item.imageUrl ? "max-w-[58%]" : ""}`}>
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
