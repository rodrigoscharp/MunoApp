import { getCardapioOuVazio } from "@/lib/menu-cache";
import { getRequestTenantId } from "@/lib/tenant-request";
import { getMaisPedidosOuVazio } from "@/lib/loja/vitrine";
import { Vitrine } from "@/components/loja/Vitrine";
import { CardapioEmBreve } from "@/components/loja/SecoesDoCardapio";

export default async function MesaCardapioPage() {
  const tenantId = await getRequestTenantId();
  const [categories, idsMaisPedidos] = await Promise.all([
    getCardapioOuVazio(tenantId),
    getMaisPedidosOuVazio(tenantId),
  ]);
  const nonEmpty = categories.filter((c) => c.items.length > 0);

  return (
    <div className="min-h-screen">
      {nonEmpty.length > 0 ? (
        // Sem cupom (não vale em pedido de mesa) e sem barra de baixo: a mesa
        // tem a sacola e a conta no próprio cabeçalho, que é fixo, e a
        // navegação de categorias gruda logo abaixo dele: 92px é a faixa da
        // mesa (h-7) mais a linha do logo (h-16), em MesaHeader.tsx.
        <Vitrine
          categorias={nonEmpty}
          idsMaisPedidos={idsMaisPedidos}
          restaurantOpen={true}
          navClassName="top-[92px]"
        />
      ) : (
        <CardapioEmBreve />
      )}
    </div>
  );
}
