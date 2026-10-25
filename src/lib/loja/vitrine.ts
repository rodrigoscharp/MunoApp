import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { runWithTenant } from "@/lib/tenant-context";
import { reportarErro } from "@/lib/observabilidade";
import { formatCurrency } from "@/lib/utils";
import type { CategoriaDoCardapio, ItemDoCardapio } from "@/lib/menu-cache";
import { tagDoCardapio } from "@/lib/menu-cache";

/**
 * O que a vitrine da loja mostra acima das categorias: o banner, a fileira de
 * "Mais pedidos" e o card do cupom. Nada disso tem campo próprio no cadastro;
 * sai do que o restaurante já tem — os pedidos dos últimos 30 dias e o cupom
 * que o dono marcou como destaque.
 *
 * As duas leituras seguem o desenho de getCardapio (src/lib/menu-cache.ts):
 * unstable_cache por tenant, runWithTenant por fora e por dentro, falha de
 * banco lançada dentro do cache e degradada fora. Um `.catch` lá dentro
 * guardaria "nenhum mais pedido" pelo prazo inteiro.
 */

const JANELA_DIAS = 30;
const QUANTOS = 8;

async function lerMaisPedidos(tenantId: string): Promise<string[]> {
  const desde = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000);
  // OrderItem é escopado por tenant: o where recebe tenantId da extensão, e a
  // consulta não precisa de prismaUnscoped.
  const linhas = await runWithTenant(tenantId, () =>
    prisma.orderItem.groupBy({
      by: ["menuItemId"],
      where: { order: { createdAt: { gte: desde }, status: { not: "CANCELLED" } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      // Folga sobre QUANTOS: parte dos mais vendidos pode estar indisponível
      // hoje e sai no cruzamento com o cardápio.
      take: QUANTOS * 2,
    })
  );
  return linhas.map((l) => l.menuItemId);
}

/**
 * Ids dos itens mais pedidos nos últimos 30 dias, do mais vendido para o
 * menos. Uma hora de cache, com a tag do cardápio: editar o cardápio também
 * refaz a fileira.
 */
export function getMaisPedidos(tenantId: string): Promise<string[]> {
  const emCache = unstable_cache(() => lerMaisPedidos(tenantId), ["mais-pedidos", tenantId], {
    revalidate: 3600,
    tags: [tagDoCardapio(tenantId)],
  });
  return runWithTenant(tenantId, emCache);
}

/**
 * Os itens da fileira, já cruzados com o cardápio: só o que está disponível
 * agora, os vendidos primeiro e na ordem de venda. Quando os vendidos não
 * enchem a fileira (restaurante novo, ou com poucos pedidos no mês), ela
 * completa com os outros itens com foto, e depois sem foto: uma fileira de um
 * item só parecia cardápio quebrado.
 */
export function escolherMaisPedidos(
  categorias: CategoriaDoCardapio[],
  idsMaisPedidos: string[],
  quantos = QUANTOS
): ItemDoCardapio[] {
  const todos = categorias.flatMap((c) => c.items).filter((i) => i.available);
  const porId = new Map(todos.map((i) => [i.id, i]));
  const vendidos = idsMaisPedidos
    .map((id) => porId.get(id))
    .filter((i): i is ItemDoCardapio => !!i);
  const escolhidos = new Set(vendidos.map((i) => i.id));
  const resto = todos.filter((i) => !escolhidos.has(i.id));
  const comFoto = resto.filter((i) => i.imageUrl);
  const semFoto = resto.filter((i) => !i.imageUrl);
  return [...vendidos, ...comFoto, ...semFoto].slice(0, quantos);
}

export async function getMaisPedidosOuVazio(tenantId: string): Promise<string[]> {
  try {
    return await getMaisPedidos(tenantId);
  } catch (erro) {
    await reportarErro({ origem: "cardapio/mais-pedidos", erro, extra: { tenantId } });
    return [];
  }
}

/** O cupom como o card da vitrine mostra: código e o que ele dá, nada mais. */
export interface CupomDaVitrine {
  code: string;
  beneficio: string;
}

export function tagDoCupomEmDestaque(tenantId: string): string {
  return `cupom-destaque:${tenantId}`;
}

export function beneficioDoCupom(cupom: {
  type: "PERCENT" | "FIXED" | "FREE_SHIPPING";
  value: number;
  minOrder: number;
}): string {
  const base =
    cupom.type === "PERCENT"
      ? `${Number(cupom.value.toFixed(2)).toString().replace(".", ",")}% off`
      : cupom.type === "FIXED"
        ? `${formatCurrency(cupom.value)} off`
        : "Entrega grátis";
  return cupom.minOrder > 0 ? `${base} acima de ${formatCurrency(cupom.minOrder)}` : base;
}

async function lerCupomEmDestaque(tenantId: string): Promise<CupomDaVitrine | null> {
  const agora = new Date();
  const cupom = await runWithTenant(tenantId, () =>
    prisma.coupon.findFirst({
      where: {
        destaque: true,
        active: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: agora } }] },
          { OR: [{ validUntil: null }, { validUntil: { gte: agora } }] },
        ],
      },
      select: { code: true, type: true, value: true, minOrder: true },
    })
  );
  if (!cupom) return null;
  return {
    code: cupom.code,
    beneficio: beneficioDoCupom({
      type: cupom.type,
      value: Number(cupom.value),
      minOrder: Number(cupom.minOrder),
    }),
  };
}

/**
 * O cupom em destaque, se houver um ativo e dentro da validade. Cinco minutos
 * de cache: é o prazo máximo em que um cupom que acabou de vencer ainda
 * aparece no card. O checkout valida de novo no servidor, então o pior caso é
 * o card anunciar um cupom que a sacola recusa com a mensagem de vencido.
 */
export function getCupomEmDestaque(tenantId: string): Promise<CupomDaVitrine | null> {
  const emCache = unstable_cache(
    () => lerCupomEmDestaque(tenantId),
    ["cupom-destaque", tenantId],
    { revalidate: 300, tags: [tagDoCupomEmDestaque(tenantId)] }
  );
  return runWithTenant(tenantId, emCache);
}

export async function getCupomEmDestaqueOuNada(tenantId: string): Promise<CupomDaVitrine | null> {
  try {
    return await getCupomEmDestaque(tenantId);
  } catch (erro) {
    await reportarErro({ origem: "cardapio/cupom-destaque", erro, extra: { tenantId } });
    return null;
  }
}

/** Para as rotas de cupom: depois de gravar, o card da loja reflete na hora. */
export function invalidarCupomEmDestaque(tenantId: string): void {
  try {
    revalidateTag(tagDoCupomEmDestaque(tenantId), { expire: 0 });
  } catch {
    // fora de uma requisição do Next (teste, script): não há cache a limpar
  }
}
