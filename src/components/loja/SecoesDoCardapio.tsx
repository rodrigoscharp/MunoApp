import { ProductCard } from "@/components/menu/ProductCard";
import { cardTemPrioridade, itemParaCard, type CategoriaDoCardapio } from "@/lib/menu-cache";
import { idDaSecao } from "@/lib/loja/ancoras";

/**
 * As seções do cardápio, uma por categoria: manchete e grade de cards. É
 * componente de servidor; só os cards são ilhas de cliente, e cada um recebe
 * o recorte que lê (itemParaCard), não o item inteiro.
 */
export function SecoesDoCardapio({
  categorias,
  restaurantOpen,
}: {
  categorias: CategoriaDoCardapio[];
  restaurantOpen: boolean;
}) {
  return (
    <div className="space-y-10">
      {categorias.map((category, indiceCategoria) => (
        <section key={category.id} id={idDaSecao(category.slug)} aria-labelledby={`titulo-${idDaSecao(category.slug)}`}>
          <div className="mb-4 flex items-baseline gap-3">
            <h2 id={`titulo-${idDaSecao(category.slug)}`} className="manchete text-[1.9rem] text-forest-dark">
              {category.name}
            </h2>
            <span className="text-xs font-semibold text-loja-tinta-2">
              {category.items.length} {category.items.length === 1 ? "item" : "itens"}
            </span>
          </div>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {category.items.map((item, indiceItem) => (
              <li key={item.id}>
                <ProductCard
                  item={itemParaCard(item)}
                  restaurantOpen={restaurantOpen}
                  prioridade={cardTemPrioridade(indiceCategoria, indiceItem)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** O estado vazio, enquanto o dono não cadastrou nenhum item. */
export function CardapioEmBreve() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-loja-pessego">
        <svg aria-hidden="true" className="h-8 w-8 text-loja-preco" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      </div>
      <p className="manchete text-[1.8rem] text-forest-dark">Cardápio em breve</p>
      <p className="text-sm text-loja-tinta-2">Os itens serão adicionados pelo administrador.</p>
    </div>
  );
}
