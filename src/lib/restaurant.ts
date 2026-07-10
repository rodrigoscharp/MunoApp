import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { runWithTenant } from "@/lib/tenant-context";

export interface RestaurantInfo {
  name: string;
  address: string;
  phone: string;
  logoUrl: string;
}

const DEFAULT: RestaurantInfo = {
  name: "Muno Food Restaurante",
  address: "Rua Paraty 1772, Ubatuba-SP",
  phone: "(12) 99999-0000",
  logoUrl: "/munowbg.png",
};

// tenantId entra como argumento para que o unstable_cache diferencie o
// cache por tenant — sem isso, o restaurante info de um tenant vazaria
// para os outros (mesma chave de cache global).
const getRestaurantInfoCached = unstable_cache(
  async (tenantId: string): Promise<RestaurantInfo> => {
    try {
      const setting = await runWithTenant(tenantId, () =>
        prisma.setting.findUnique({
          where: { tenantId_key: { tenantId, key: "restaurant_info" } },
        })
      );
      return setting ? { ...DEFAULT, ...JSON.parse(setting.value) } : DEFAULT;
    } catch {
      return DEFAULT;
    }
  },
  ["restaurant_info"],
  { revalidate: 60, tags: ["restaurant_info"] }
);

// runWithTenant precisa envolver a chamada por fora do unstable_cache: se
// ficar só dentro do callback cacheado, o contexto do AsyncLocalStorage se
// perde antes da extensão de tenant do Prisma rodar (getCurrentTenantId()
// lança "Nenhum tenant no contexto da request"), e a query cai silenciosamente
// no catch, retornando o valor default.
export function getRestaurantInfo(tenantId: string): Promise<RestaurantInfo> {
  return runWithTenant(tenantId, () => getRestaurantInfoCached(tenantId));
}
