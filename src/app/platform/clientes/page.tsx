import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import { calcularMrr } from "@/lib/platform-metrics";
import { buildTenantBaseUrl } from "@/lib/tenant-provisioning";
import { formatCurrency } from "@/lib/utils";
import { MensalidadeInline } from "@/components/platform/MensalidadeInline";

export default async function ClientesPage() {
  const session = await authPlatform();
  if (!session?.user) return null;

  const tenants = await prismaUnscoped.tenant.findMany({
    include: { _count: { select: { orders: true } } },
    orderBy: { createdAt: "desc" },
  });

  const mrr = calcularMrr(tenants);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-2xl font-bold">Clientes</h1>
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
          {tenants.map((t) => (
            <li
              key={t.id}
              className="bg-console-cartao rounded-xl border border-console-linha px-5 py-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="font-semibold truncate">{t.nome}</p>
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
                <MensalidadeInline
                  tenantId={t.id}
                  valorAtual={t.valorMensal != null ? Number(t.valorMensal) : null}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
