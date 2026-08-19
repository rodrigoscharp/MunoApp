import { unstable_cache } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { runWithTenant } from "@/lib/tenant-context";

/**
 * O que o PUT aceita gravar.
 *
 * A rota fazia `JSON.stringify(body)` direto, sem olhar o conteúdo: um corpo
 * `{}` não era recusado — virava o cadastro novo, e nome, endereço, telefone e
 * logo sumiam do cabeçalho, do rodapé e do cardápio público de uma vez, sem
 * erro e sem cópia anterior. `name` obrigatório é o que impede isso: o
 * formulário sempre o manda, e um corpo que não o traz não é um cadastro.
 *
 * O schema também descarta campo que não pertence ao cadastro, para que o valor
 * gravado tenha só a forma que `getRestaurantInfo` sabe ler.
 */
export const restaurantInfoSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do restaurante"),
  address: z.string().default(""),
  phone: z.string().default(""),
  logoUrl: z.string().default("/munowbg.png"),
  floorPlanImageUrl: z.string().nullable().default(null),
});

export interface RestaurantInfo {
  name: string;
  address: string;
  phone: string;
  logoUrl: string;
  floorPlanImageUrl: string | null;
}

/**
 * O que se mostra enquanto o dono não preencheu o cadastro.
 *
 * Endereço e telefone ficam VAZIOS de propósito, e o cardápio esconde a linha
 * quando não há valor (ver Header.tsx e Footer.tsx). Até 18/08/2026 este objeto
 * trazia "Muno Food Restaurante / Rua Paraty 1772, Ubatuba-SP / (12) 99999-0000",
 * o restaurante do seed: todo tenant novo, e todo tenant cujo JSON de cadastro
 * falhasse ao ser lido, publicava para os próprios clientes o endereço e o
 * telefone de outro negócio — no rodapé do cardápio, no cabeçalho e no e-mail de
 * recuperação de senha. É o mesmo erro que tirou a hamburgueria de Ubatuba do
 * domínio raiz, na versão silenciosa: ninguém reclama de um rodapé.
 *
 * O nome cai para o `nome` do próprio Tenant, que sempre existe.
 */
export const SEM_CADASTRO: Omit<RestaurantInfo, "name"> = {
  address: "",
  phone: "",
  logoUrl: "/munowbg.png",
  floorPlanImageUrl: null,
};

// tenantId entra como argumento para que o unstable_cache diferencie o
// cache por tenant — sem isso, o restaurante info de um tenant vazaria
// para os outros (mesma chave de cache global).
const getRestaurantInfoCached = unstable_cache(
  async (tenantId: string): Promise<RestaurantInfo> => {
    // Tenant não é model escopado por tenant (ver tenant-scoped-models.ts), por
    // isso a consulta é direta pelo id.
    const [tenant, setting] = await Promise.all([
      prisma.tenant
        .findUnique({ where: { id: tenantId }, select: { nome: true } })
        .catch(() => null),
      runWithTenant(tenantId, () =>
        prisma.setting
          .findUnique({
            where: { tenantId_key: { tenantId, key: "restaurant_info" } },
          })
          .catch(() => null)
      ),
    ]);

    const base: RestaurantInfo = { ...SEM_CADASTRO, name: tenant?.nome ?? "" };
    if (!setting) return base;

    try {
      return { ...base, ...JSON.parse(setting.value) };
    } catch {
      // JSON corrompido no Setting. Cair para o cadastro vazio é melhor que
      // cair para o de outro restaurante.
      return base;
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
