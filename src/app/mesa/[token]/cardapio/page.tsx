import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { runWithTenant } from "@/lib/tenant-context";
import { getRequestTenantId } from "@/lib/tenant-request";
import { CategoryNav } from "@/components/menu/CategoryNav";
import { ProductCard } from "@/components/menu/ProductCard";
import { MenuItemWithCategory } from "@/types";

const getMenuCached = unstable_cache(
  async (tenantId: string) => {
    try {
      return await runWithTenant(tenantId, () =>
        prisma.category.findMany({
          orderBy: { position: "asc" },
          include: {
            items: { where: { available: true }, orderBy: { name: "asc" } },
          },
        })
      );
    } catch {
      return [];
    }
  },
  ["menu"],
  { revalidate: 60 }
);

// runWithTenant precisa envolver a chamada por fora do unstable_cache: se
// ficar só dentro do callback cacheado, o contexto do AsyncLocalStorage se
// perde antes da extensão de tenant do Prisma rodar (getCurrentTenantId()
// lança "Nenhum tenant no contexto da request"), e a query cai silenciosamente
// no catch, retornando [].
function getMenu(tenantId: string) {
  return runWithTenant(tenantId, () => getMenuCached(tenantId));
}

export default async function MesaCardapioPage() {
  const tenantId = await getRequestTenantId();
  const categories = await getMenu(tenantId);
  const nonEmpty = categories.filter((c) => c.items.length > 0);

  return (
    <div className="min-h-screen">
      {nonEmpty.length > 0 ? (
        <>
          <CategoryNav categories={nonEmpty.map(({ id, name, slug }) => ({ id, name, slug }))} />
          <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
            {nonEmpty.map((category) => (
              <section key={category.id} id={category.slug}>
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div className="flex items-center gap-3">
                    <span className="w-1 h-6 rounded-full bg-brand" />
                    <h2 className="text-lg font-bold text-neutral-900 tracking-tight">
                      {category.name}
                    </h2>
                    <span className="text-xs text-neutral-400 font-normal">
                      {category.items.length} {category.items.length === 1 ? "item" : "itens"}
                    </span>
                  </div>
                  {category.items.length > 2 && (
                    <span className="sm:hidden text-xs text-neutral-400 flex items-center gap-1 shrink-0">
                      deslize
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  )}
                </div>

                <div className="
                  flex gap-3 overflow-x-auto snap-x snap-mandatory pb-3 -mx-4 px-4
                  no-scrollbar
                  sm:grid sm:grid-cols-3 lg:grid-cols-4
                  sm:gap-4 sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0
                ">
                  {category.items.map((item) => (
                    <div key={item.id} className="shrink-0 w-44 snap-start sm:w-auto sm:shrink sm:h-full">
                      <ProductCard
                        item={{ ...item, price: Number(item.price) } as unknown as MenuItemWithCategory}
                        restaurantOpen={true}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-neutral-400 gap-3">
          <div className="w-16 h-16 rounded-full bg-brand-light flex items-center justify-center">
            <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-base font-medium text-neutral-600">Cardápio em breve</p>
          <p className="text-sm text-neutral-400">Os itens serão adicionados pelo administrador.</p>
        </div>
      )}
    </div>
  );
}
