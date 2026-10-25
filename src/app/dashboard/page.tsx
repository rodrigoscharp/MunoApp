import { KitchenBoard } from "@/components/kitchen/KitchenBoard";
import { auth } from "@/lib/auth";
import { getRestaurantInfo } from "@/lib/restaurant";
import { getRequestTenantId } from "@/lib/tenant-request";

export default async function DashboardPage() {
  // O layout já barrou quem não é ADMIN/KITCHEN, e o proxy garantiu que a
  // sessão é deste restaurante. getRestaurantInfo é cacheado por tenant e
  // degrada para nome vazio: o quadro nunca cai por causa do topo.
  const tenantId = await getRequestTenantId();
  const [session, info] = await Promise.all([auth(), getRestaurantInfo(tenantId)]);
  return (
    <KitchenBoard
      restaurante={info.name}
      usuario={session?.user.name}
      ehAdmin={session?.user.role === "ADMIN"}
    />
  );
}
