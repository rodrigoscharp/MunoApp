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
    <div className="space-y-10">
      <h1 className="display text-[2rem] leading-none">visão geral</h1>

      {/* A pauta abre a tela: o que precisa de atenção vem antes do que é só
          referência. Fica deliberadamente quieta — o arco é dos blocos. */}
      <section className="bg-console-cartao rounded-2xl border border-console-linha px-6 py-5">
        <p className="text-[13px] text-neutral-400 mb-3">pauta</p>
        <ul className="space-y-2">
          {pauta.map((item) => (
            <li key={item.chave} className="text-[17px] leading-snug">
              {item.texto}
            </li>
          ))}
        </ul>
        {semLeads && (
          <Link
            href="/leads"
            className="inline-flex items-center gap-1.5 mt-5 text-[15px] font-semibold text-console-campo hover:text-console-campo-esc transition"
          >
            Cadastrar o primeiro
            <ArrowRight size={16} />
          </Link>
        )}
      </section>

      {/* Os três arcos, apoiados na mesma linha de base — o ritmo das letras do
          logotipo. Não são cartões com um arco em cima: a forma É o bloco. */}
      <section className="grid grid-cols-3 gap-3 sm:gap-5 items-end">
        <Arco
          rotulo="vendas"
          valor={String(abertos)}
          unidade="leads abertos"
          apoio={`${novosNoMes} este mês`}
        />
        <Arco
          rotulo="clientes"
          valor={String(ativos)}
          unidade="ativos"
          apoio={`${pedidos} pedidos`}
        />
        <Arco
          rotulo="receita"
          valor={formatCurrency(mrr)}
          unidade="por mês"
          apoio={`${comPlano} com plano`}
          compacto
        />
      </section>
    </div>
  );
}

function Arco({
  rotulo,
  valor,
  unidade,
  apoio,
  compacto,
}: {
  rotulo: string;
  valor: string;
  unidade: string;
  apoio: string;
  /** Valores em real são longos; encolhe a fonte para não quebrar a linha. */
  compacto?: boolean;
}) {
  return (
    <div className="arco bg-console-cartao border border-console-linha px-4 sm:px-6 pt-10 sm:pt-14 pb-5 flex flex-col items-center text-center">
      <p className="text-[12px] sm:text-[13px] text-neutral-400">{rotulo}</p>

      {/* O verde é o dado — o mesmo papel que o garfo tem dentro da palavra. */}
      <p
        className={`display text-console-dado leading-none mt-1.5 ${
          compacto ? "text-2xl sm:text-4xl" : "text-4xl sm:text-6xl"
        }`}
      >
        {valor}
      </p>

      <p className="text-[12px] sm:text-sm text-neutral-500 mt-2">{unidade}</p>
      <p className="text-[11px] sm:text-xs text-neutral-400 mt-4 pt-3 border-t border-console-linha w-full">
        {apoio}
      </p>
    </div>
  );
}
