import { SessionProvider } from "next-auth/react";
import { Header } from "@/components/menu/Header";
import { BusinessHours } from "@/components/menu/BusinessHours";
import { Footer } from "@/components/menu/Footer";
import { getRestaurantInfo } from "@/lib/restaurant";
import { getBusinessHours } from "@/lib/business-hours";
import { getRequestTenantId } from "@/lib/tenant-request";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenantId = await getRequestTenantId();
  const [info, schedule] = await Promise.all([
    getRestaurantInfo(tenantId),
    getBusinessHours(tenantId),
  ]);

  // O SessionProvider fica aqui, e não no layout raiz: este é o único ramo
  // com useSession (Header, checkout e as notificações de pedido). Na raiz ele
  // cobria também o subdomínio da plataforma, onde /api/auth/session não
  // existe e o fetch voltava com HTML.
  return (
    <SessionProvider>
      <BusinessHours schedule={schedule} />
      <Header restaurantInfo={info} />
      <main className="flex-1">{children}</main>
      <Footer restaurantInfo={info} schedule={schedule} />
    </SessionProvider>
  );
}
