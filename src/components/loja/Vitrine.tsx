import { CategoryNav } from "@/components/menu/CategoryNav";
import { escolherMaisPedidos } from "@/lib/loja/vitrine";
import { BANNER_PADRAO, chamadaDoBanner, escolherItemDoBanner, type ConfigDoBanner } from "@/lib/loja/banner";
import { itemParaCard, type CategoriaDoCardapio } from "@/lib/menu-cache";
import type { CupomDaVitrine } from "@/lib/loja/vitrine";
import { ProvedorDaFolha } from "@/components/loja/FolhaDoProduto";
import { BuscaNoCardapio } from "@/components/loja/BuscaNoCardapio";
import { BannerDestaque } from "@/components/loja/BannerDestaque";
import { MaisPedidos } from "@/components/loja/MaisPedidos";
import { CardCupom } from "@/components/loja/CardCupom";
import { SecoesDoCardapio } from "@/components/loja/SecoesDoCardapio";

/**
 * O cardápio da loja na ordem do mockup: busca, banner, categorias, mais
 * pedidos, cupom e as seções. O delivery e a mesa montam a mesma vitrine; a
 * mesa sem cupom (cupom não vale em DINE_IN) e com a navegação grudando abaixo
 * do próprio cabeçalho.
 *
 * `categorias` já vem sem as vazias.
 */
export function Vitrine({
  categorias,
  idsMaisPedidos,
  banner = BANNER_PADRAO,
  cupom = null,
  restaurantOpen,
  navClassName,
  antesDasSecoes,
}: {
  categorias: CategoriaDoCardapio[];
  idsMaisPedidos: string[];
  /** Mais vendido (padrão) ou o item que o dono escolheu no painel. */
  banner?: ConfigDoBanner;
  cupom?: CupomDaVitrine | null;
  restaurantOpen: boolean;
  navClassName?: string;
  /** O que entra entre o topo da vitrine e as seções (filtro, convite do app). */
  antesDasSecoes?: React.ReactNode;
}) {
  const vendidos = escolherMaisPedidos(categorias, idsMaisPedidos);
  const maisPedidos = vendidos.map(itemParaCard);
  // O dia sai da hora desta requisição: a página é dinâmica (o tenant vem dos
  // headers), então o "SEXTA" do banner vira "SÁBADO" sozinho à meia-noite.
  const doBanner = escolherItemDoBanner(banner, categorias, vendidos);
  const chamada = doBanner ? chamadaDoBanner(banner, doBanner.modo, new Date()) : "";
  const todos = categorias.flatMap((c) => c.items.map(itemParaCard));

  return (
    <ProvedorDaFolha restaurantOpen={restaurantOpen} maisPedidos={maisPedidos}>
      <div className="mx-auto max-w-5xl space-y-4 px-4 pb-2 pt-3">
        <BuscaNoCardapio itens={todos} restaurantOpen={restaurantOpen} />
        {doBanner && (
          <BannerDestaque
            item={itemParaCard(doBanner.item)}
            recorte={doBanner.item.imagemRecortadaUrl}
            kickerTexto={chamada}
          />
        )}
      </div>

      {/* Sem invólucro: sticky só gruda dentro do pai, e o pai da navegação
          precisa ser a página inteira. */}
      <CategoryNav
        categories={categorias.map(({ id, name, slug }) => ({ id, name, slug }))}
        comMaisPedidos={maisPedidos.length > 0}
        className={navClassName}
      />

      <div className="mx-auto max-w-5xl space-y-5 px-4 pt-3">
        <MaisPedidos itens={maisPedidos} restaurantOpen={restaurantOpen} />
        {cupom && <CardCupom cupom={cupom} />}
        {antesDasSecoes}
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-10 pt-6">
        <SecoesDoCardapio categorias={categorias} restaurantOpen={restaurantOpen} />
      </div>
    </ProvedorDaFolha>
  );
}
