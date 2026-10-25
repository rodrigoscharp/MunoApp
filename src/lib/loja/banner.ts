import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { runWithTenant } from "@/lib/tenant-context";
import { reportarErro } from "@/lib/observabilidade";
import { BANNER_PADRAO, CHAVE_DO_BANNER, bannerSchema, type ConfigDoBanner } from "@/lib/loja/banner-regras";

export * from "@/lib/loja/banner-regras";

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

