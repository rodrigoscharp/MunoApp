import { RegisterForm } from "@/components/auth/RegisterForm";
import { getRestaurantInfo } from "@/lib/restaurant";
import { getRequestTenantId } from "@/lib/tenant-request";

// Mesma razão do login: o painel de marca precisa do restaurante do
// subdomínio, e o formulário (client component) mora agora em
// src/components/auth — arquivo de rota fica com o que é rota.
export default async function RegisterPage() {
  const tenantId = await getRequestTenantId();
  const restaurantInfo = await getRestaurantInfo(tenantId);

  return <RegisterForm restaurantInfo={restaurantInfo} />;
}
