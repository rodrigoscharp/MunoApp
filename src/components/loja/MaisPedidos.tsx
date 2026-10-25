import { ProductCard } from "@/components/menu/ProductCard";
import type { ItemDaVitrine } from "@/components/loja/tipos";
import { ANCORA_DOS_MAIS_PEDIDOS } from "@/lib/loja/ancoras";

/**
 * A fileira horizontal de "Mais pedidos". No celular ela rola de lado e
 * encosta na borda direita da tela, para o card cortado avisar que há mais.
 */
export function MaisPedidos({ itens, restaurantOpen }: { itens: ItemDaVitrine[]; restaurantOpen: boolean }) {
  if (itens.length === 0) return null;
  return (
    <section id={ANCORA_DOS_MAIS_PEDIDOS} aria-labelledby="titulo-mais-pedidos" className="scroll-mt-32">
      <h2 id="titulo-mais-pedidos" className="text-base font-extrabold text-loja-tinta">
        Mais pedidos
      </h2>
      <ul className="no-scrollbar -mx-4 mt-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
        {itens.map((item) => (
          <li key={item.id} className="w-[128px] shrink-0 snap-start sm:w-[150px]">
            <ProductCard item={item} restaurantOpen={restaurantOpen} variante="fileira" />
          </li>
        ))}
      </ul>
    </section>
  );
}
