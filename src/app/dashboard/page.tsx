import { KitchenBoard } from "@/components/kitchen/KitchenBoard";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth();
  return <KitchenBoard tenantId={session!.user.tenantId} />;
}
