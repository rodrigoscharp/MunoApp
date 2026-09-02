import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { Header } from "@/components/menu/Header";
import { BusinessHours } from "@/components/menu/BusinessHours";
import { Footer } from "@/components/menu/Footer";
import { getRestaurantInfo } from "@/lib/restaurant";
import { getBusinessHours } from "@/lib/business-hours";
import { getRequestTenantId } from "@/lib/tenant-request";
import { ConviteDeInstalacao } from "@/components/pwa/ConviteDeInstalacao";
import { origemDoLogo } from "@/lib/pwa/logo-do-tenant";
import { versaoDoLogo } from "@/lib/pwa/manifest";

/**
 * A identidade do restaurante nas tags que o manifest não alcança.
 *
 * São duas coisas, e as duas existem porque o Safari lê meta tag e ignora boa
 * parte do manifest:
 *
 * - **O nome** embaixo do ícone, via apple-mobile-web-app-title. Sem ele o
 *   cliente instalaria um atalho chamado "Muno", o nome da plataforma que ele
 *   não conhece, no lugar do negócio onde ele pede comida.
 *
 * - **O ícone**, via apple-touch-icon (a tela inicial do iPhone) e icon (a aba
 *   do navegador). O manifest cobre o Android; estes dois cobrem o iOS e a aba
 *   em todo lugar. Sem logo cadastrado nada é sobrescrito, e valem os arquivos
 *   da Muno que a convenção do Next já serve.
 *
 * getRestaurantInfo é cacheado por tenant, então esta é a mesma leitura que o
 * layout abaixo já faz, não uma segunda ida ao banco.
 */
export async function generateMetadata(): Promise<Metadata> {
  const tenantId = await getRequestTenantId();
  const info = await getRestaurantInfo(tenantId);

  const appleWebApp = { capable: true, title: info.name || "Muno" };
  if (!origemDoLogo(info.logoUrl)) return { appleWebApp };

  // Mesmo carimbo do manifest, pelo mesmo motivo: a rota responde `immutable`,
  // e é a URL que muda quando o dono troca o logo.
  const v = versaoDoLogo(info.logoUrl);
  return {
    appleWebApp,
    icons: {
      icon: { url: `/icone/192.png?v=${v}`, type: "image/png", sizes: "192x192" },
      apple: { url: `/icone/apple.png?v=${v}`, type: "image/png", sizes: "180x180" },
    },
  };
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
