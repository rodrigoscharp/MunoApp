import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import { calcularMrr } from "@/lib/platform-metrics";
import { buildTenantBaseUrl } from "@/lib/tenant-provisioning";
import { formatCurrency } from "@/lib/utils";
import { diasDeAtraso, type StatusAssinatura } from "@/lib/assinatura/regua";
import { MensalidadeInline } from "@/components/platform/MensalidadeInline";
import { DarBaixa } from "@/components/platform/DarBaixa";

/**
 * A situação de cobrança na lista, decidida pelo status da assinatura **e**
 * pelo atraso da cobrança em aberto mais antiga.
 *
 * Ler só o status deixaria a coluna dizendo "em dia" nos seis primeiros dias
 * de atraso, que é justamente quando um telefonema ainda resolve sem atrito
 * (ver statusPelaRegua: até o sétimo dia o status segue ATIVA de propósito).
 */
function situacaoDaAssinatura(
  status: StatusAssinatura,
  dias: number
): { texto: string; classe: string } {
  if (status === "CANCELADA") return { texto: "cancelada", classe: "text-neutral-400" };
  if (status === "BLOQUEADA") return { texto: "bloqueada", classe: "text-red-600" };
  if (status === "INADIMPLENTE")
    return { texto: "inadimplente", classe: "text-orange-500" };
  return dias >= 1
    ? { texto: "em atraso", classe: "text-amber-600" }
    : { texto: "em dia", classe: "text-neutral-500" };
}

export default async function ClientesPage() {
  const session = await authPlatform();
  if (!session?.user) return null;

  const tenants = await prismaUnscoped.tenant.findMany({
    include: {
      _count: { select: { orders: true } },
      assinatura: {
        include: {
          // Só o que está em aberto, do mais antigo para o mais novo: é a
          // primeira linha que manda na régua e é nela que a baixa é dada.
          // Puxar o histórico inteiro de todo cliente para exibir uma cobrança
          // seria carregar a lista com dado que a tela não mostra.
          cobrancas: {
            where: { status: { in: ["PENDENTE", "VENCIDA"] } },
            orderBy: { vencimento: "asc" },
            select: { id: true, competencia: true, valor: true, vencimento: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const agora = new Date();

  // A assinatura é 1:1 com o tenant, então somar as assinaturas desta lista é
  // somar todas — não há assinatura sem restaurante.
  const mrr = calcularMrr(
    tenants.flatMap((t) => (t.assinatura ? [t.assinatura] : []))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <h1 className="display text-[2rem] leading-none">clientes</h1>
        <div className="text-right">
          <p className="tabular text-[11px] uppercase tracking-[0.16em] text-neutral-400">
            Receita mensal
          </p>
          <p className="tabular text-xl font-semibold">{formatCurrency(mrr)}</p>
        </div>
      </div>

      {tenants.length === 0 ? (
        <p className="text-neutral-500 py-16 text-center">
          Nenhum cliente ainda. Eles aparecem aqui quando você converte um lead.
        </p>
      ) : (
        <ul className="space-y-2">
          {tenants.map((t) => {
            // A cobrança em aberto mais antiga manda em tudo nesta linha: é
            // ela que a régua mede e é nela que a baixa é dada. As demais em
            // aberto ficam para a próxima baixa — uma de cada vez, na ordem do
            // vencimento, é como a conta se acerta.
            const maisAntiga = t.assinatura?.cobrancas[0] ?? null;
            const dias = maisAntiga ? diasDeAtraso(maisAntiga.vencimento, agora) : 0;
            const situacao = t.assinatura
              ? situacaoDaAssinatura(t.assinatura.status, dias)
              : null;

            return (
            <li
              key={t.id}
              className="bg-console-cartao rounded-xl border border-console-linha px-5 py-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold truncate">{t.nome}</p>
                  {/* Status do restaurante, não da assinatura: um cliente
                      suspenso continua na receita mensal acima enquanto a
                      assinatura não for cancelada. Verde discreto, nunca
                      terracota: terracota é ação, e status não é ação. */}
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      t.status === "active"
                        ? "bg-forest-light text-console-dado"
                        : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {t.status === "active" ? "ativo" : t.status}
                  </span>
                </div>
                <a
                  href={buildTenantBaseUrl(t.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="tabular text-xs text-neutral-400 hover:text-brand transition"
                >
                  {t.slug}
                </a>
              </div>

              <div className="flex items-center gap-6 shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="tabular text-sm">{t._count.orders}</p>
                  <p className="text-[11px] text-neutral-400">pedidos</p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="tabular text-sm">
                    {t.createdAt.toLocaleDateString("pt-BR")}
                  </p>
                  <p className="text-[11px] text-neutral-400">desde</p>
                </div>

                {/* A situação da cobrança. Fica visível em qualquer largura,
                    ao contrário de pedidos e desde: é por ela que o operador
                    varre a lista quando cai um PIX. */}
                {situacao && (
                  <div className="text-right">
                    <p className={`text-sm font-medium ${situacao.classe}`}>
                      {situacao.texto}
                    </p>
                    <p className="text-[11px] text-neutral-400">
                      {dias >= 1
                        ? dias === 1
                          ? "vencida há 1 dia"
                          : `vencida há ${dias} dias`
                        : maisAntiga
                          ? "cobrança em aberto"
                          : "nada em aberto"}
                    </p>
                  </div>
                )}

                {maisAntiga && (
                  // Decimal do Prisma não atravessa a fronteira do Server
                  // Component — vai como número, igual à mensalidade acima.
                  <DarBaixa
                    cobrancaId={maisAntiga.id}
                    valor={Number(maisAntiga.valor)}
                    competencia={maisAntiga.competencia}
                  />
                )}

                <MensalidadeInline
                  tenantId={t.id}
                  valorAtual={
                    t.assinatura ? Number(t.assinatura.valorMensal) : null
                  }
                  diaAtual={t.assinatura?.diaVencimento ?? null}
                />
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
