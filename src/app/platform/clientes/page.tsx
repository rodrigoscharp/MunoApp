import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import { calcularMrr } from "@/lib/platform-metrics";
import { buildTenantBaseUrl } from "@/lib/tenant-provisioning";
import { formatCurrency } from "@/lib/utils";
import { diasDeAtraso } from "@/lib/assinatura/regua";
import { CLASSE_DO_TOM, situacaoDoCliente } from "@/lib/assinatura/situacao";
import { MensalidadeInline } from "@/components/platform/MensalidadeInline";
import { DarBaixa } from "@/components/platform/DarBaixa";

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
      <div className="flex items-end justify-between gap-3 pt-2 pb-1 sm:pb-3">
        <h1 className="text-[30px] sm:text-[40px] font-semibold tracking-[-0.04em] leading-none">
          Clientes
        </h1>
        <div className="text-right shrink-0">
          <p className="text-[12px] text-console-mudo">Receita mensal</p>
          <p className="tabular text-[20px] sm:text-[24px] font-semibold tracking-[-0.02em]">
            {formatCurrency(mrr)}
          </p>
        </div>
      </div>

      {tenants.length === 0 ? (
        <p className="text-console-mudo py-16 text-center">
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
            const situacao = situacaoDoCliente({
              temAssinatura: t.assinatura !== null,
              status: t.assinatura?.status,
              diasDeAtraso: dias,
              emCortesia: t.assinatura
                ? t.assinatura.inicioCobranca > agora
                : false,
            });

            return (
            <li
              key={t.id}
              // No celular a linha vira cartão empilhado: nome em cima, número
              // no meio, ação embaixo em largura cheia. Em 375px a versão
              // horizontal espremia o nome em três letras e jogava o editor de
              // mensalidade para fora da tela.
              className="console-vidro rounded-[22px] sm:rounded-[28px] px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold truncate">{t.nome}</p>
                  {/* Status do restaurante, não da assinatura: um cliente
                      suspenso continua na receita mensal acima enquanto a
                      assinatura não for cancelada. Verde discreto, nunca
                      terracota: terracota é ação, e status não é ação. */}
                  <span
                    className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      t.status === "active"
                        ? "bg-console-positivo-fundo text-console-positivo"
                        : "bg-console-tinta/[0.06] text-console-mudo"
                    }`}
                  >
                    {t.status === "active" ? "ativo" : t.status}
                  </span>
                </div>
                <a
                  href={buildTenantBaseUrl(t.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="tabular text-xs text-console-mudo hover:text-console-tinta transition"
                >
                  {t.slug}
                </a>
                {/* No celular pedidos e desde não cabem como coluna, mas cabem
                    como linha de apoio embaixo do nome. */}
                <p className="sm:hidden text-[12px] text-console-mudo mt-1 tabular">
                  {t._count.orders} {t._count.orders === 1 ? "pedido" : "pedidos"}
                  {" · desde "}
                  {t.createdAt.toLocaleDateString("pt-BR")}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between sm:justify-end gap-x-4 gap-y-3 sm:gap-6 sm:shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="tabular text-sm">{t._count.orders}</p>
                  <p className="text-[11px] text-console-mudo">pedidos</p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="tabular text-sm">
                    {t.createdAt.toLocaleDateString("pt-BR")}
                  </p>
                  <p className="text-[11px] text-console-mudo">desde</p>
                </div>

                {/* A situação da cobrança. Fica visível em qualquer largura,
                    ao contrário de pedidos e desde: é por ela que o operador
                    varre a lista quando cai um PIX. */}
                {situacao && (
                  <div className="text-left sm:text-right order-first sm:order-none basis-full sm:basis-auto">
                    <p className={`text-sm font-medium ${CLASSE_DO_TOM[situacao.tom]}`}>
                      {situacao.texto}
                    </p>
                    <p className="text-[11px] text-console-mudo">
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
