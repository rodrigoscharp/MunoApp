import { redirect } from "next/navigation";
import { TableManager } from "@/components/adm/TableManager";
import { getRequestTenantPlano } from "@/lib/tenant-request";
import { tenantTemMesaQr } from "@/lib/plans";

export default async function MesasAdminPage() {
  // O item some do sidebar pra quem não tem o plano, mas isso não impede
  // digitar a URL direto: sem este guard, a tela renderiza mesmo assim.
  const plano = await getRequestTenantPlano();
  if (!tenantTemMesaQr(plano)) {
    redirect("/adm");
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <TableManager />
    </div>
  );
}
