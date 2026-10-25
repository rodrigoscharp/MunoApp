import { unstable_cache } from "next/cache";
import { TAG_AVISO_DE_COBRANCA } from "@/lib/cache-de-cobranca";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/adm/AdminSidebar";
import { AvisoDeCobranca } from "@/components/adm/AvisoDeCobranca";
import { prisma } from "@/lib/prisma";
import { withRequestTenant, getRequestTenantPlano } from "@/lib/tenant-request";
import { avisoDeAtraso } from "@/lib/assinatura/aviso";
import { tenantTemMesaQr } from "@/lib/plans";
import { getRestaurantInfo } from "@/lib/restaurant";
import { getBusinessHours } from "@/lib/business-hours";
import { estadoDaLoja } from "@/lib/painel/estado-da-loja";
import { pedidosEmAndamentoEmCache } from "@/lib/analytics";
import { fontesDaLoja } from "@/lib/loja/fontes";
import { cn } from "@/lib/utils";

/**
 * O vencimento da cobrança em aberto mais antiga, guardado por cinco minutos
 * por restaurante.
 *
 * O layout roda em toda navegação dentro do /adm, e esta consulta ia junto a
 * cada clique no menu, para uma resposta que muda uma vez por mês. O cache é
 * só da FAIXA: quem fecha a gestão é o proxy, que lê a assinatura por conta
 * própria (`BLOQUEADA` ou `encerraEm` vencido). Quem grava cobrança limpa
 * este cache (`invalidarCacheDeCobranca`); se algum caminho escapar, o pior é
 * uma faixa velha por cinco minutos, nunca um acesso negado ou concedido por
 * engano.
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
  { revalidate: 300, tags: [TAG_AVISO_DE_COBRANCA] }
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
  //
  // O cartão do restaurante e o número de pedidos em andamento saem junto,
  // todos em cache curto por restaurante (cadastro e horário 60s, contagem
  // 30s): o layout roda em toda carga do /adm. Aberto ou fechado é calculado
  // agora, sobre o horário guardado, com a mesma regra do cardápio.
  const { aviso, restaurante, pedidosEmAndamento } = await withRequestTenant(async (tenantId) => {
    const [vencimento, info, horario, emAndamento] = await Promise.all([
      vencimentoEmAbertoMaisAntigo(tenantId),
      getRestaurantInfo(tenantId),
      getBusinessHours(tenantId),
      // O número é enfeite: se a contagem falhar, o menu fica sem ele, e o
      // painel não cai por isso.
      pedidosEmAndamentoEmCache(tenantId).catch(() => 0),
    ]);
    const estado = estadoDaLoja(horario);
    return {
      aviso: avisoDeAtraso(vencimento ? new Date(vencimento) : null, new Date()),
      restaurante: { nome: info.name, aberto: estado.aberto, rotulo: estado.rotulo },
      pedidosEmAndamento: emAndamento,
    };
  });

  const plano = await getRequestTenantPlano();

  // `loja` e as fontes da loja vêm aqui, no invólucro do painel, e não no
  // layout raiz (ver src/lib/loja/fontes.ts): o painel usa o mesmo sistema
  // visual da loja, o console e a landing não.
  return (
    <div className={cn("loja min-h-screen lg:flex", fontesDaLoja)}>
      <AdminSidebar
        user={{ name: session.user.name ?? "", email: session.user.email ?? "" }}
        temMesaQr={tenantTemMesaQr(plano)}
        restaurante={restaurante}
        pedidosEmAndamento={pedidosEmAndamento}
      />
      <main className="min-w-0 flex-1 pb-24 pt-14 lg:pb-0 lg:pt-0">
        <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {aviso && <AvisoDeCobranca tom={aviso.tom} dias={aviso.dias} />}
          {children}
        </div>
      </main>
    </div>
  );
}
