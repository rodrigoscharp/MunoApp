import { LoginForm } from "@/components/auth/LoginForm";
import { getRestaurantInfo } from "@/lib/restaurant";
import { getRequestTenantId } from "@/lib/tenant-request";

// Server Component para que o painel de marca leia o restaurante do
// subdomínio. Enquanto a tela era um client component puro, o nome e o
// endereço estavam escritos no JSX — e eram os do restaurante do seed.
export default async function LoginPage() {
  const tenantId = await getRequestTenantId();
  const restaurantInfo = await getRestaurantInfo(tenantId);

  return <LoginForm restaurantInfo={restaurantInfo} />;
}
