import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import {
  calcularMrr,
  contarLeadsAbertos,
  montarPauta,
} from "@/lib/platform-metrics";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default async function VisaoGeralPage() {
  const session = await authPlatform();
  if (!session?.user) return null;

  const inicioDoMes = new Date();
  inicioDoMes.setDate(1);
  inicioDoMes.setHours(0, 0, 0, 0);

  const [leads, tenants, pedidos, novosNoMes] = await Promise.all([
    prismaUnscoped.lead.findMany({
      select: { status: true, tenantId: true, updatedAt: true },
    }),
    prismaUnscoped.tenant.findMany({
      select: { status: true, valorMensal: true },
    }),
    prismaUnscoped.order.count(),
    prismaUnscoped.lead.count({ where: { createdAt: { gte: inicioDoMes } } }),
  ]);

  const pauta = montarPauta(leads, new Date());
  const mrr = calcularMrr(tenants);
  const abertos = contarLeadsAbertos(leads);
  const ativos = tenants.filter((t) => t.status === "active").length;
  const comPlano = tenants.filter(
    (t) => t.status === "active" && t.valorMensal != null
  ).length;

  const semLeads = pauta[0].chave === "sem-leads";

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Visão geral</h1>

      {/* A pauta abre a tela: o que precisa de atenção vem antes do que é só
          referência. */}
      <section className="bg-console-cartao rounded-2xl border border-console-linha p-5">
        <p className="tabular text-[11px] uppercase tracking-[0.16em] text-neutral-400 mb-3">
          Pauta
        </p>
        <ul className="space-y-2">
          {pauta.map((item) => (
            <li key={item.chave} className="text-[15px]">
              {item.texto}
            </li>
          ))}
        </ul>
        {semLeads && (
          <Link
            href="/leads"
            className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-brand hover:text-brand-dark transition"
          >
            Cadastrar o primeiro
            <ArrowRight size={15} />
          </Link>
        )}
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Bloco
          rotulo="Vendas"
          valor={String(abertos)}
          unidade="leads abertos"
          apoio={`${novosNoMes} este mês`}
        />
        <Bloco
          rotulo="Clientes"
          valor={String(ativos)}
          unidade="ativos"
          apoio={`${pedidos} pedidos`}
        />
        <Bloco
          rotulo="Receita"
          valor={formatCurrency(mrr)}
          unidade="por mês"
          apoio={`${comPlano} com plano`}
        />
      </section>
    </div>
  );
}

function Bloco({
  rotulo,
  valor,
  unidade,
  apoio,
}: {
  rotulo: string;
  valor: string;
  unidade: string;
  apoio: string;
}) {
  return (
    <div className="bg-console-cartao rounded-2xl border border-console-linha p-5">
      <p className="tabular text-[11px] uppercase tracking-[0.16em] text-neutral-400">
        {rotulo}
      </p>
      <p className="tabular text-3xl font-semibold mt-2 leading-none">{valor}</p>
      <p className="text-xs text-neutral-500 mt-1.5">{unidade}</p>
      <p className="tabular text-xs text-neutral-400 mt-3 pt-3 border-t border-console-linha">
        {apoio}
      </p>
    </div>
  );
}
