import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/adm/AdminSidebar";
import { AvisoDeCobranca } from "@/components/adm/AvisoDeCobranca";
import { prisma } from "@/lib/prisma";
import { withRequestTenant, getRequestTenantPlano } from "@/lib/tenant-request";
import { avisoDeAtraso } from "@/lib/assinatura/aviso";
import { tenantTemMesaQr } from "@/lib/plans";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");

  // A faixa mora no layout para aparecer em toda tela de gestão, e não só na
  // que o dono resolveu abrir. Ela olha a cobrança em aberto mais antiga, não
  // assinatura.status — ver o comentário em src/lib/assinatura/aviso.ts.
  const aviso = await withRequestTenant(async (tenantId) => {
    const cobranca = await prisma.cobranca.findFirst({
      where: {
        // Cobranca não tem tenantId (ela pendura na Assinatura), então o
        // escopo vem explícito pela relação — a extensão de tenant do Prisma
        // não alcança filtro aninhado.
        assinatura: { tenantId },
        // CANCELADA fica de fora: cobrança cancelada é a plataforma dizendo
        // que aquele mês não se cobra, não uma dívida em aberto.
        status: { in: ["PENDENTE", "VENCIDA"] },
      },
      orderBy: { vencimento: "asc" },
      select: { vencimento: true },
    });
    return avisoDeAtraso(cobranca?.vencimento ?? null, new Date());
  });

  const plano = await getRequestTenantPlano();

  return (
    <div className="min-h-screen flex bg-neutral-100">
      <AdminSidebar
        user={{ name: session.user.name ?? "", email: session.user.email ?? "" }}
        temMesaQr={tenantTemMesaQr(plano)}
      />
      <main className="flex-1 overflow-auto pt-14 pb-20 lg:pt-0 lg:pb-0">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6 lg:py-8">
          {aviso && <AvisoDeCobranca tom={aviso.tom} dias={aviso.dias} />}
          {children}
        </div>
      </main>
    </div>
  );
}
