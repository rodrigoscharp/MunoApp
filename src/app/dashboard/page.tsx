import { KitchenBoard } from "@/components/kitchen/KitchenBoard";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth();
  // tenantId é opcional no tipo Session (a sessão de plataforma não tem um);
  // aqui o proxy já garantiu sessão de restaurante com papel ADMIN/KITCHEN.
  return <KitchenBoard tenantId={session!.user.tenantId!} />;
}
