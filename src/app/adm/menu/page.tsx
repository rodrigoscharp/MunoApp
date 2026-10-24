import { prismaUnscoped } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { MenuManager } from "@/components/adm/MenuManager";

export default async function AdminMenuPage() {
  const session = await auth();
  const tenantId = session!.user.tenantId;

  const categories = await prismaUnscoped.category.findMany({
    where: { tenantId },
    orderBy: { position: "asc" },
    include: {
      items: { orderBy: { name: "asc" } },
    },
  });

  // As mesmas categorias, na mesma ordem, só com o que o modal precisa.
  // Era uma segunda consulta ao banco, em série, pela lista que já estava aqui.
  const allCategories = categories.map(({ id, name, slug }) => ({ id, name, slug }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Cardápio</h1>
      <MenuManager
        initialCategories={categories.map((c) => ({
          ...c,
          items: c.items.map((item) => ({
            ...item,
            price: Number(item.price),
          })),
        }))}
        allCategories={allCategories}
      />
    </div>
  );
}
