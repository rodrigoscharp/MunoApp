import { notFound } from "next/navigation";
import { prismaUnscoped } from "@/lib/prisma";
import { getRequestTenantId, getRequestTenantPlano } from "@/lib/tenant-request";
import { getRestaurantInfo } from "@/lib/restaurant";
import { MesaHeader } from "@/components/mesa/MesaHeader";
import { MesaIndisponivel } from "@/components/mesa/MesaIndisponivel";
import { tenantTemMesaQr } from "@/lib/plans";
import { ContextoDoCarrinho } from "@/components/cart/ContextoDoCarrinho";
import { MesaDaAba } from "@/components/mesa/MesaDaAba";
import { fontesDaLoja } from "@/lib/loja/fontes";

export default async function MesaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Antes de qualquer query: custo zero (só header), e evita revelar se o
  // token existe ou não pra um plano que nem tem acesso à feature.
  const plano = await getRequestTenantPlano();
  if (!tenantTemMesaQr(plano)) {
    return <MesaIndisponivel />;
  }

  const tenantId = await getRequestTenantId();

  // Nota: consultas diretas (fora de unstable_cache/Route Handlers) usam
  // prismaUnscoped + tenantId explícito no where — o cliente Prisma com
  // extensão de tenant (AsyncLocalStorage) trava com um erro de WASM quando
  // chamado direto dentro da renderização de um Server Component neste
  // ambiente (funciona normalmente em Route Handlers e em funções
  // unstable_cache, então esses continuam usando a extensão).
  const [table, restaurantInfo] = await Promise.all([
    prismaUnscoped.table.findFirst({
      where: { token, active: true, tenantId },
      select: { id: true, number: true, name: true, token: true },
    }),
    getRestaurantInfo(tenantId),
  ]);

  if (!table) notFound();

  return (
    <div className={`loja ${fontesDaLoja} min-h-screen flex flex-col`}>
      {/* Carrinho próprio desta mesa: nem o do delivery, nem o de outro QR. */}
      <ContextoDoCarrinho contexto={`mesa:${table.token}`} />
      {/* A mesa lida aqui vai para a aba, para o checkout não buscar de novo. */}
      <MesaDaAba
        tableId={table.id}
        tableNumber={table.number}
        tableName={table.name}
        tableToken={table.token}
      />
      <MesaHeader
        restaurantInfo={restaurantInfo}
        tableNumber={table.number}
        tableName={table.name}
        token={table.token}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
