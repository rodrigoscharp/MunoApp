import { prismaUnscoped } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { MenuManager } from "@/components/adm/MenuManager";
import { escolherItemDoBanner, getBannerOuPadrao } from "@/lib/loja/banner";
import { escolherMaisPedidos, getMaisPedidosOuVazio } from "@/lib/loja/vitrine";

export default async function AdminMenuPage() {
  const session = await auth();
  const tenantId = session!.user.tenantId!;

  // O banner e os mais pedidos saem do cache da loja (uma hora, limpo quando o
  // cardápio ou o banner mudam): a faixa "No banner agora" custa duas leituras
  // de cache, não uma agregação de pedidos a cada abertura da tela.
  const [rawCategories, banner, idsMaisPedidos] = await Promise.all([
    prismaUnscoped.category.findMany({
      where: { tenantId },
      orderBy: { position: "asc" },
      include: {
        items: { orderBy: { name: "asc" } },
      },
    }),
    getBannerOuPadrao(tenantId),
    getMaisPedidosOuVazio(tenantId),
  ]);

  const categories = rawCategories.map((c) => ({
    ...c,
    items: c.items.map((item) => ({
      ...item,
      price: Number(item.price),
    })),
  }));

  // As mesmas categorias, na mesma ordem, só com o que o modal precisa.
  // Era uma segunda consulta ao banco, em série, pela lista que já estava aqui.
  const allCategories = categories.map(({ id, name, slug }) => ({ id, name, slug }));

  // A mesma escolha da Vitrine (src/components/loja/Vitrine.tsx): só o que
  // vendeu de verdade concorre a "o mais vendido".
  const fileira = escolherMaisPedidos(categories, idsMaisPedidos);
  const doBanner = escolherItemDoBanner(banner, categories, fileira.itens.slice(0, fileira.vendidos));

  return (
    <MenuManager
      initialCategories={categories}
      allCategories={allCategories}
      noBanner={doBanner ? { itemId: doBanner.item.id, modo: doBanner.modo } : null}
    />
  );
}
