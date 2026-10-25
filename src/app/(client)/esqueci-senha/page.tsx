import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { getRestaurantInfo } from "@/lib/restaurant";
import { getRequestTenantId } from "@/lib/tenant-request";

// Server Component pelo mesmo motivo do login: o painel de marca lê o
// restaurante do subdomínio. O formulário mora em src/components/auth.
export default async function ForgotPasswordPage() {
  const tenantId = await getRequestTenantId();
  const restaurantInfo = await getRestaurantInfo(tenantId);

  return <ForgotPasswordForm restaurantInfo={restaurantInfo} />;
}
