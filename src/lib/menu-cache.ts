import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { runWithTenant } from "@/lib/tenant-context";
import { reportarErro } from "@/lib/observabilidade";

/**
 * O cardápio público, em cache por restaurante.
 *
 * Três consumidores leem a MESMA coisa: a vitrine (`(client)/page.tsx`), o
 * cardápio da mesa (`mesa/[token]/cardapio`) e o `GET /api/menu`, que alimenta
 * o upsell do carrinho. Antes cada página tinha a sua cópia do cache, e a rota
 * ia direto ao banco.
 *
 * Duas decisões que parecem detalhe:
 *
 * - **O erro não é cacheado.** A versão antiga fazia `catch { return [] }`
 *   DENTRO do callback, e o `unstable_cache` guardava aquele vazio como se fosse
 *   o cardápio: uma queda de 2 segundos no banco virava 60 segundos de
 *   "Cardápio em breve" para todo cliente do restaurante. Aqui a falha sobe pelo
 *   callback (o cache não grava rejeição) e quem decide o que mostrar é o
 *   chamador, em `getCardapioOuVazio`.
 * - **A tag é por restaurante.** Com `revalidate` de uma hora, o que mantém o
 *   cardápio em dia é a invalidação nas rotas que o alteram
 *   (`invalidarCardapio`). Uma tag global faria a edição de um preço numa
 *   pizzaria jogar fora o cache de todos os outros restaurantes.
 */

export interface ItemDoCardapio {
  id: string;
  name: string;
  description: string | null;
  // number, e não Decimal: o unstable_cache serializa em JSON, e o Decimal do
  // Prisma voltaria do cache como string. Converter antes de gravar faz as três
  // leituras receberem o mesmo tipo, com ou sem cache.
  price: number;
  imageUrl: string | null;
  available: boolean;
  categoryId: string;
  containsGluten: boolean | null;
  containsLactose: boolean | null;
  isVegan: boolean | null;
}

export interface CategoriaDoCardapio {
  id: string;
  name: string;
  slug: string;
  position: number;
  items: ItemDoCardapio[];
}

// Uma hora: o cache vive da invalidação explícita, e o prazo é só a rede para
// uma escrita que tenha escapado dela (script, psql na mão).
export const REVALIDAR_CARDAPIO_SEGUNDOS = 3600;

export function tagDoCardapio(tenantId: string): string {
  return `menu:${tenantId}`;
}

async function lerCardapio(tenantId: string): Promise<CategoriaDoCardapio[]> {
  // `select` em vez de `include`: tenantId, createdAt e updatedAt não servem a
  // nenhum dos três consumidores, e tudo o que sai daqui vai para o payload da
  // página e para o JSON público da rota.
  const categorias = await runWithTenant(tenantId, () =>
    prisma.category.findMany({
      orderBy: { position: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        position: true,
        items: {
          where: { available: true },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            imageUrl: true,
            available: true,
            categoryId: true,
            containsGluten: true,
            containsLactose: true,
            isVegan: true,
          },
        },
      },
    })
  );

  return categorias.map((c) => ({
    ...c,
    items: c.items.map((item) => ({ ...item, price: Number(item.price) })),
  }));
}

/**
 * Lê o cardápio do restaurante, do cache quando houver. Falha de banco é
 * propagada (e não fica no cache).
 *
 * O `unstable_cache` é montado a cada chamada porque a tag depende do tenant, e
 * as opções de um `unstable_cache` de módulo são fixas. O tenantId vai também
 * nas `keyParts`: o callback é uma closure, e sem ele na chave dois restaurantes
 * dividiriam a mesma entrada.
 *
 * runWithTenant envolve a chamada por fora do unstable_cache, além de por
 * dentro: se ficar só dentro do callback cacheado, o contexto do
 * AsyncLocalStorage se perde antes da extensão de tenant do Prisma rodar
 * (getCurrentTenantId() lança "Nenhum tenant no contexto da request").
 */
export function getCardapio(tenantId: string): Promise<CategoriaDoCardapio[]> {
  const emCache = unstable_cache(() => lerCardapio(tenantId), ["menu", tenantId], {
    revalidate: REVALIDAR_CARDAPIO_SEGUNDOS,
    tags: [tagDoCardapio(tenantId)],
  });
  return runWithTenant(tenantId, emCache);
}

/**
 * Para as páginas: o cardápio, ou vazio se o banco falhar. A página continua de
 * pé ("Cardápio em breve") em vez de cair no error boundary, e o vazio não
 * entra no cache, então a próxima visita já tenta de novo.
 */
export async function getCardapioOuVazio(tenantId: string): Promise<CategoriaDoCardapio[]> {
  try {
    return await getCardapio(tenantId);
  } catch (erro) {
    await reportarErro({ origem: "cardapio/leitura", erro, extra: { tenantId } });
    return [];
  }
}

/**
 * O que o ProductCard (e o AddToCartModal que ele abre) lê de um item. Cada
 * card vira props de Client Component, e cada prop vai serializada no payload
 * RSC da página: categoryId e as declarações alimentares não são lidos ali.
 */
export type ItemDoCard = Pick<
  ItemDoCardapio,
  "id" | "name" | "description" | "price" | "imageUrl" | "available"
>;

export function itemParaCard(item: ItemDoCardapio): ItemDoCard {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    price: item.price,
    imageUrl: item.imageUrl,
    available: item.available,
  };
}

/** O que o FiltroDeRestricoes lê de um item (ver `ItemDoFiltro` lá). */
export function itemParaFiltro(item: ItemDoCardapio, categoria: { name: string }) {
  return {
    id: item.id,
    name: item.name,
    price: item.price,
    imageUrl: item.imageUrl,
    containsGluten: item.containsGluten,
    containsLactose: item.containsLactose,
    isVegan: item.isVegan,
    category: { name: categoria.name },
  };
}

/**
 * Quantos cards do topo da vitrine carregam a imagem com prioridade: os da
 * primeira categoria que cabem na primeira dobra (4 colunas no desktop). Mais
 * que isso disputaria banda com a imagem que de fato é o LCP.
 */
export const CARDS_COM_PRIORIDADE = 4;

export function cardTemPrioridade(indiceCategoria: number, indiceItem: number): boolean {
  return indiceCategoria === 0 && indiceItem < CARDS_COM_PRIORIDADE;
}

/**
 * Chamar depois de toda escrita em MenuItem ou Category.
 *
 * `{ expire: 0 }`, e não o perfil "max" das telas de configuração: com "max" a
 * primeira visita depois da edição ainda recebe a versão velha, e aqui a versão
 * velha é o item que o dono acabou de desativar por falta de ingrediente sendo
 * pedido mais uma vez. `updateTag` resolveria, mas só existe em Server Action, e
 * estas escritas vêm de Route Handlers.
 */
export function invalidarCardapio(tenantId: string): void {
  revalidateTag(tagDoCardapio(tenantId), { expire: 0 });
}
