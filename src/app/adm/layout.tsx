import { unstable_cache } from "next/cache";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/adm/AdminSidebar";
import { AvisoDeCobranca } from "@/components/adm/AvisoDeCobranca";
import { prisma } from "@/lib/prisma";
import { withRequestTenant, getRequestTenantPlano } from "@/lib/tenant-request";
import { avisoDeAtraso } from "@/lib/assinatura/aviso";
import { tenantTemMesaQr } from "@/lib/plans";

/**
 * O vencimento da cobrança em aberto mais antiga, guardado por cinco minutos
 * por restaurante.
 *
 * O layout roda em toda navegação dentro do /adm, e esta consulta ia junto a
 * cada clique no menu, para uma resposta que muda uma vez por mês. O cache é
 * só da FAIXA: quem fecha a gestão é o proxy, que lê a assinatura por conta
 * própria (`BLOQUEADA` ou `encerraEm` vencido). Uma faixa cinco minutos
 * atrasada depois de um pagamento é um aviso velho, nunca um acesso negado ou
 * concedido por engano.
 *
 * O tenantId é argumento, e entra na chave do cache. O retorno é a data em ISO
 * porque o cache passa por JSON, e um Date voltaria como texto de qualquer
 * jeito.
 */
const vencimentoEmAbertoMaisAntigo = unstable_cache(
  async (tenantId: string): Promise<string | null> => {
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
    return cobranca?.vencimento.toISOString() ?? null;
  },
  ["adm-aviso-de-cobranca"],
  { revalidate: 300 }
);

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  // O layout não conhece o caminho pedido; /adm é o ponto de entrada da
  // gestão e é para lá que o login devolve. O LoginForm passa o callbackUrl
  // por destinoSeguro().
  if (!session || session.user.role !== "ADMIN") {
    redirect(`/login?callbackUrl=${encodeURIComponent("/adm")}`);
  }

  // A faixa mora no layout para aparecer em toda tela de gestão, e não só na
  // que o dono resolveu abrir. Ela olha a cobrança em aberto mais antiga, não
  // assinatura.status — ver o comentário em src/lib/assinatura/aviso.ts.
  //
  // Só o vencimento vem do cache; os dias de atraso são contados agora, com o
  // relógio de agora, para a faixa não mostrar o número de cinco minutos atrás.
  const aviso = await withRequestTenant(async (tenantId) => {
    const vencimento = await vencimentoEmAbertoMaisAntigo(tenantId);
    return avisoDeAtraso(vencimento ? new Date(vencimento) : null, new Date());
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
