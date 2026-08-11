import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import {
  calcularMrr,
  contarLeadsAbertos,
  montarPauta,
  montarSemanas,
} from "@/lib/platform-metrics";
import { formatCurrency } from "@/lib/utils";
import { diasDeAtraso } from "@/lib/assinatura/regua";
import { FunilBarras } from "@/components/platform/FunilBarras";
import { LeadsPorSemana } from "@/components/platform/LeadsPorSemana";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default async function VisaoGeralPage() {
  const session = await authPlatform();
  if (!session?.user) return null;

  const inicioDoMes = new Date();
  inicioDoMes.setDate(1);
  inicioDoMes.setHours(0, 0, 0, 0);

  const [leads, tenants, assinaturas, pedidos, novosNoMes, emAberto] =
    await Promise.all([
      prismaUnscoped.lead.findMany({
        select: {
          status: true,
          tenantId: true,
          updatedAt: true,
          createdAt: true,
        },
      }),
      prismaUnscoped.tenant.findMany({
        select: { status: true },
      }),
      prismaUnscoped.assinatura.findMany({
        select: { status: true, valorMensal: true },
      }),
      prismaUnscoped.order.count(),
      prismaUnscoped.lead.count({ where: { createdAt: { gte: inicioDoMes } } }),
      // O que ainda não entrou. Mesmo predicado que a régua e a baixa usam,
      // para os três não contarem conjuntos diferentes.
      prismaUnscoped.cobranca.findMany({
        where: { status: { in: ["PENDENTE", "VENCIDA"] } },
        orderBy: { vencimento: "asc" },
        select: {
          id: true,
          valor: true,
          vencimento: true,
          competencia: true,
          assinatura: { select: { tenant: { select: { nome: true } } } },
        },
      }),
    ]);

  const agora = new Date();
  const pauta = montarPauta(leads, agora);
  const mrr = calcularMrr(assinaturas);
  const abertos = contarLeadsAbertos(leads);
  const ativos = tenants.filter((t) => t.status === "active").length;
  // Quem entra na soma do MRR — mesma regra do calcularMrr, para o apoio do
  // número não contar um conjunto diferente do que ele explica.
  const comPlano = assinaturas.filter((a) => a.status !== "CANCELADA").length;

  const aReceber = emAberto.reduce((s, c) => s + Number(c.valor), 0);
  const vencidas = emAberto.filter((c) => diasDeAtraso(c.vencimento, agora) > 0);

  const semLeads = pauta[0].chave === "sem-leads";

  const contagens = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});
  const semanas = montarSemanas(
    leads.map((l) => l.createdAt),
    agora
  );

  return (
    <div className="space-y-5">
      <h1 className="display text-[2rem] leading-none mb-1">visão geral</h1>

      {/* Quatro números, um sólido. O cheio é a receita porque é o que resume
          o negócio: sem ele os outros três são atividade, não resultado. Só um
          bloco saturado por tela — dois competem e nenhum ancora. */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          rotulo="receita"
          valor={formatCurrency(mrr)}
          apoio={`${comPlano} ${comPlano === 1 ? "assinatura" : "assinaturas"}`}
          ancora
        />
        <Tile
          rotulo="a receber"
          valor={formatCurrency(aReceber)}
          apoio={
            vencidas.length > 0
              ? `${vencidas.length} ${vencidas.length === 1 ? "vencida" : "vencidas"}`
              : `${emAberto.length} em aberto`
          }
          alerta={vencidas.length > 0}
        />
        <Tile
          rotulo="leads abertos"
          valor={String(abertos)}
          apoio={`${novosNoMes} ${novosNoMes === 1 ? "novo" : "novos"} este mês`}
        />
        <Tile
          rotulo="clientes"
          valor={String(ativos)}
          apoio={`${pedidos} ${pedidos === 1 ? "pedido" : "pedidos"}`}
        />
      </section>

      {/* Entrada de leads ocupa dois terços: é a série temporal, e série
          temporal espremida vira rabisco. A pauta fica ao lado porque é lista
          curta e se lê em coluna estreita. */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <LeadsPorSemana dados={semanas} />
        </div>
        <Cartao titulo="pauta">
          <ul className="space-y-2.5">
            {pauta.map((item) => (
              <li key={item.chave} className="text-[15px] leading-snug">
                {item.texto}
              </li>
            ))}
          </ul>
          {semLeads && (
            <Link
              href="/leads"
              className="inline-flex items-center gap-1.5 mt-4 text-[14px] font-semibold text-console-campo hover:text-console-campo-esc transition"
            >
              Cadastrar o primeiro
              <ArrowRight size={15} />
            </Link>
          )}
        </Cartao>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <FunilBarras contagens={contagens} />
        <div className="lg:col-span-2">
          <Cartao
            titulo="cobranças em aberto"
            acessorio={
              emAberto.length > 0 ? (
                <Link
                  href="/clientes"
                  className="text-[13px] text-console-campo hover:text-console-campo-esc transition"
                >
                  dar baixa
                </Link>
              ) : undefined
            }
          >
            {emAberto.length === 0 ? (
              <p className="text-sm text-console-tinta/45 py-6 text-center">
                Nada em aberto. Toda cobrança emitida foi paga.
              </p>
            ) : (
              <ul className="divide-y divide-console-linha -my-1">
                {emAberto.slice(0, 5).map((c) => {
                  const dias = diasDeAtraso(c.vencimento, agora);
                  return (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-[15px] truncate">
                          {c.assinatura.tenant.nome}
                        </p>
                        <p className="text-[12px] text-console-tinta/45">
                          {c.competencia.split("-").reverse().join("/")}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="tabular text-[15px]">
                          {formatCurrency(Number(c.valor))}
                        </p>
                        <p
                          className={`text-[12px] ${
                            dias > 0 ? "text-console-campo" : "text-console-tinta/45"
                          }`}
                        >
                          {dias > 0
                            ? `vencida há ${dias} ${dias === 1 ? "dia" : "dias"}`
                            : dias === 0
                              ? "vence hoje"
                              : `vence em ${-dias} ${dias === -1 ? "dia" : "dias"}`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Cartao>
        </div>
      </section>
    </div>
  );
}

/** Moldura comum dos blocos: mesmo raio, mesma borda, mesmo respiro. */
function Cartao({
  titulo,
  acessorio,
  children,
}: {
  titulo: string;
  acessorio?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-console-cartao rounded-2xl border border-console-linha px-5 py-4 h-full">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[13px] text-console-tinta/45">{titulo}</p>
        {acessorio}
      </div>
      {children}
    </div>
  );
}

function Tile({
  rotulo,
  valor,
  apoio,
  ancora,
  alerta,
}: {
  rotulo: string;
  valor: string;
  apoio: string;
  /** O único bloco sólido da tela. */
  ancora?: boolean;
  /** Pinta o apoio de terracota — usado quando há algo vencido. */
  alerta?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl px-5 py-4 border ${
        ancora
          ? "bg-console-dado border-console-dado"
          : "bg-console-cartao border-console-linha"
      }`}
    >
      <p
        className={`text-[13px] ${
          ancora ? "text-white/60" : "text-console-tinta/45"
        }`}
      >
        {rotulo}
      </p>
      <p
        className={`display leading-none mt-2 text-[26px] sm:text-[30px] ${
          ancora ? "text-white" : "text-console-dado"
        }`}
      >
        {valor}
      </p>
      <p
        className={`text-[12px] mt-2.5 ${
          ancora
            ? "text-white/55"
            : alerta
              ? "text-console-campo"
              : "text-console-tinta/45"
        }`}
      >
        {apoio}
      </p>
    </div>
  );
}
