import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { Header } from "@/components/menu/Header";
import { BusinessHours } from "@/components/menu/BusinessHours";
import { Footer } from "@/components/menu/Footer";
import { getRestaurantInfo } from "@/lib/restaurant";
import { getBusinessHours } from "@/lib/business-hours";
import { getRequestTenantId } from "@/lib/tenant-request";
import { ConviteDeInstalacao } from "@/components/pwa/ConviteDeInstalacao";

/**
 * O nome que o iPhone escreve embaixo do ícone na tela inicial.
 *
 * O Safari lê apple-mobile-web-app-title e ignora o name do manifest, então
 * sem isto o cliente do restaurante instalaria um atalho chamado "Muno": o
 * nome da plataforma que ele não conhece, no lugar do negócio onde ele pede
 * comida. O manifest resolve o mesmo problema pelo lado do Android
 * (src/app/manifest.ts).
 *
 * getRestaurantInfo é cacheado por tenant, então esta é a mesma leitura que o
 * layout abaixo já faz, não uma segunda ida ao banco.
 */
export async function generateMetadata(): Promise<Metadata> {
  const tenantId = await getRequestTenantId();
  const info = await getRestaurantInfo(tenantId);
  return { appleWebApp: { capable: true, title: info.name || "Muno" } };
}

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
      {/*
        Convite de instalação depois do login. Fica no layout, e não na tela de
        login, porque o login redireciona no mesmo instante em que a senha é
        aceita: o convite sairia da tela antes de ser lido. O LoginForm deixa
        um bilhete em sessionStorage e esta folha o consome aqui.
      */}
      <ConviteDeInstalacao />
    </SessionProvider>
  );
}
