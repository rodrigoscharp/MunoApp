import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { runWithTenant } from "@/lib/tenant-context";
import { reportarErro } from "@/lib/observabilidade";

/**
 * O tempo de entrega que o dono configura no painel ("entrega em 45 min" no
 * topo da loja). É a mesma chave que GET /api/settings e a criação de pedido
 * leem, com o mesmo padrão de 45 minutos.
 *
 * Mesmo desenho de getBusinessHours: unstable_cache por tenant, runWithTenant
 * por fora e por dentro, falha de banco lançada dentro do cache e degradada
 * fora. Cinco minutos de cache, sem tag: o PUT de /api/settings não invalida
 * nada hoje, então a troca do tempo aparece na loja em até cinco minutos.
 */
export const TEMPO_PADRAO_MINUTOS = 45;

async function lerTempoDeEntrega(tenantId: string): Promise<number> {
  const setting = await runWithTenant(tenantId, () =>
    prisma.setting.findUnique({
      where: { tenantId_key: { tenantId, key: "delivery_time_minutes" } },
    })
  );
  const minutos = setting ? parseInt(setting.value, 10) : NaN;
  return Number.isFinite(minutos) && minutos > 0 ? minutos : TEMPO_PADRAO_MINUTOS;
}

export function getTempoDeEntrega(tenantId: string): Promise<number> {
  const emCache = unstable_cache(
    () => lerTempoDeEntrega(tenantId),
    ["delivery_time_minutes", tenantId],
    { revalidate: 300 }
  );
  return runWithTenant(tenantId, emCache).catch(async (erro) => {
    await reportarErro({ origem: "loja/tempo-de-entrega", erro, extra: { tenantId } });
    return TEMPO_PADRAO_MINUTOS;
  });
}
