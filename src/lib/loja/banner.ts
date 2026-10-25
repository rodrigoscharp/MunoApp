import { unstable_cache } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { runWithTenant } from "@/lib/tenant-context";
import { reportarErro } from "@/lib/observabilidade";
import type { CategoriaDoCardapio, ItemDoCardapio } from "@/lib/menu-cache";

/**
 * O banner do topo do cardápio.
 *
 * Funciona sozinho: no modo "mais vendido", que é o padrão, ele mostra o item
 * que mais saiu nos últimos 30 dias, e troca quando outro passar à frente. O
 * dono só mexe quando quer empurrar um item específico (lançamento,
 * promoção): no modo "item" ele escolhe qual, e pode trocar a chamada.
 *
 * O texto se monta do que já existe: o dia de hoje, o nome do lanche e o
 * preço. Nada de preço digitado duas vezes nem foto enviada à parte; a foto
 * sem fundo é a do próprio item (MenuItem.imagemRecortadaUrl).
 */

export const CHAVE_DO_BANNER = "banner_cardapio";

export const bannerSchema = z.object({
  modo: z.enum(["mais-vendido", "item"]).default("mais-vendido"),
  itemId: z.string().min(1).nullable().default(null),
  // A chamada depois do dia ("SEXTA · LANÇAMENTO"). Curta porque divide a
  // linha com o dia no celular.
  chamada: z.string().trim().max(24, "Use até 24 caracteres").default(""),
});

export type ConfigDoBanner = z.infer<typeof bannerSchema>;

export const BANNER_PADRAO: ConfigDoBanner = { modo: "mais-vendido", itemId: null, chamada: "" };

export function tagDoBanner(tenantId: string): string {
  return `banner:${tenantId}`;
}

async function lerBanner(tenantId: string): Promise<ConfigDoBanner> {
  const setting = await runWithTenant(tenantId, () =>
    prisma.setting.findUnique({ where: { tenantId_key: { tenantId, key: CHAVE_DO_BANNER } } })
  );
  if (!setting) return BANNER_PADRAO;
  // Configuração corrompida é dado, não falha passageira: volta ao padrão e
  // pode ficar em cache.
  try {
    const lido = bannerSchema.safeParse(JSON.parse(setting.value));
    return lido.success ? lido.data : BANNER_PADRAO;
  } catch {
    return BANNER_PADRAO;
  }
}

/** A configuração do banner, com cache por restaurante. Falha de banco vira o padrão, fora do cache. */
export async function getBannerOuPadrao(tenantId: string): Promise<ConfigDoBanner> {
  const emCache = unstable_cache(() => lerBanner(tenantId), ["banner", tenantId], {
    revalidate: 3600,
    tags: [tagDoBanner(tenantId)],
  });
  try {
    return await runWithTenant(tenantId, emCache);
  } catch (erro) {
    await reportarErro({ origem: "cardapio/banner", erro, extra: { tenantId } });
    return BANNER_PADRAO;
  }
}

/**
 * O modo que o banner acabou usando. "destaque" é o mais vendido sem venda
 * nenhuma no mês: há banner, mas ele não pode dizer "o mais pedido".
 */
export type ModoDoBanner = ConfigDoBanner["modo"] | "destaque";

/**
 * Qual item vai no banner. No modo "item", o escolhido, se ainda estiver no
 * cardápio e disponível; senão, volta sozinho ao mais vendido, para o banner
 * nunca anunciar o que não dá para pedir.
 *
 * `vendidos` são só os itens que saíram de verdade nos 30 dias, nunca a
 * fileira inteira: ela é completada com itens sem venda, e o primeiro deles
 * viraria "O MAIS PEDIDO" num restaurante que não vendeu nada. Sem venda, o
 * banner mostra um item da casa (com foto sem fundo, depois com foto) no modo
 * "destaque", com uma chamada que não promete o que não aconteceu.
 */
export function escolherItemDoBanner(
  config: ConfigDoBanner,
  categorias: CategoriaDoCardapio[],
  vendidos: ItemDoCardapio[]
): { item: ItemDoCardapio; modo: ModoDoBanner } | null {
  const disponiveis = categorias.flatMap((c) => c.items).filter((i) => i.available);
  if (config.modo === "item" && config.itemId) {
    const escolhido = disponiveis.find((i) => i.id === config.itemId);
    if (escolhido) return { item: escolhido, modo: "item" };
  }
  const [maisVendido] = vendidos;
  if (maisVendido) return { item: maisVendido, modo: "mais-vendido" };
  const daCasa =
    disponiveis.find((i) => i.imagemRecortadaUrl) ??
    disponiveis.find((i) => i.imageUrl) ??
    disponiveis[0];
  return daCasa ? { item: daCasa, modo: "destaque" } : null;
}

const DIAS = ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"];

/**
 * O dia da semana em Brasília. O servidor roda em UTC, e às 22h de quinta em
 * São Paulo já é sexta em UTC: sem o fuso, o banner anunciaria o dia errado
 * justamente no horário de maior movimento.
 */
export function diaDaSemanaEmBrasilia(agora: Date): string {
  const nome = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Sao_Paulo" }).format(agora);
  const indice = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(nome);
  return DIAS[indice >= 0 ? indice : 0];
}

/**
 * O texto pequeno de cima: "SEXTA · O MAIS PEDIDO", ou com a chamada do dono.
 * "O mais pedido" só sai quando o item vendeu de verdade (modo "mais-vendido").
 */
export function chamadaDoBanner(
  config: ConfigDoBanner,
  modoUsado: ModoDoBanner,
  agora: Date
): string {
  const dia = diaDaSemanaEmBrasilia(agora);
  const resto =
    modoUsado === "item"
      ? config.chamada || "Destaque da casa"
      : modoUsado === "destaque"
        ? "Destaque da casa"
        : "O mais pedido";
  return `${dia} · ${resto.toUpperCase()}`;
}
