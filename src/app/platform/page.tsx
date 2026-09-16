import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import {
  calcularMrr,
  contarLeadsAbertos,
  montarPauta,
  montarSemanas,
  type ChaveDaPauta,
} from "@/lib/platform-metrics";
import {
  FUSO,
  contarEntre,
  preencherDias,
  recebidoPorMes,
  rotuloDoMes,
  serieAcumulada,
  serieDeMrr,
  ultimosMeses,
  variacao,
  type LinhaDiaria,
} from "@/lib/platform-series";
import { formatCurrency } from "@/lib/utils";
import { diasDeAtraso } from "@/lib/assinatura/regua";
import { Painel } from "@/components/platform/Painel";
import {
  VisaoGeralKpis,
  type KpiDoResumo,
} from "@/components/platform/VisaoGeralKpis";
import { GraficoAtividade } from "@/components/platform/GraficoAtividade";
import { GraficoBarras } from "@/components/platform/GraficoBarras";
import { FunilBarras } from "@/components/platform/FunilBarras";
import { RankingRestaurantes } from "@/components/platform/RankingRestaurantes";

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/** A cor do ponto de cada item da pauta: o que pede ação primeiro. */
const TOM_DA_PAUTA: Record<ChaveDaPauta, string> = {
  "sem-leads": "bg-console-mudo",
  "fechado-sem-cliente": "bg-console-alerta",
  parados: "bg-console-aviso",
  negociando: "bg-console-grafico",
  "em-dia": "bg-console-grafico",
};

export default async function VisaoGeralPage() {
  const session = await authPlatform();
  if (!session?.user) return null;

  const agora = new Date();
  const ha = (dias: number) => new Date(agora.getTime() - dias * DIA_EM_MS);
  const [primeiroMes] = ultimosMeses(agora, 12);
  const inicioDosDozeMeses = new Date(`${primeiroMes}-01T00:00:00-03:00`);

  const [
    leads,
    tenants,
    assinaturas,
    emAberto,
    pagas,
    linhasDiarias,
    porRestaurante,
  ] = await Promise.all([
    prismaUnscoped.lead.findMany({
      select: { status: true, tenantId: true, updatedAt: true, createdAt: true },
    }),
    prismaUnscoped.tenant.findMany({
      select: { id: true, nome: true, status: true, createdAt: true },
    }),
    prismaUnscoped.assinatura.findMany({
      select: {
        status: true,
        valorMensal: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
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
    prismaUnscoped.cobranca.findMany({
      where: { status: "PAGA", pagoEm: { gte: inicioDosDozeMeses } },
      select: { valor: true, pagoEm: true },
    }),
    // Pedidos de todos os restaurantes, um ano dia a dia. Agregado no banco:
    // trazer as linhas seria carregar cada pedido do ano para somar três
    // colunas. O dia é o de São Paulo, o mesmo fuso das chaves que
    // preencherDias gera, senão a série troca o nome dos dias perto da meia
    // noite. `createdAt` é timestamp sem fuso gravado em UTC, daí o duplo AT
    // TIME ZONE.
    prismaUnscoped.$queryRaw<LinhaDiaria[]>`
      SELECT
        to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${FUSO}, 'YYYY-MM-DD') AS dia,
        count(*)::int AS pedidos,
        coalesce(sum(total), 0)::float8 AS volume
      FROM "Order"
      WHERE "createdAt" >= ${ha(366)} AND status <> 'CANCELLED'
      GROUP BY 1
    `,
    prismaUnscoped.order.groupBy({
      by: ["tenantId"],
      where: { createdAt: { gte: ha(30) }, status: { not: "CANCELLED" } },
      _count: { _all: true },
      _sum: { total: true },
      orderBy: { _count: { tenantId: "desc" } },
      take: 6,
    }),
  ]);

  // ---- Resumo -------------------------------------------------------------

  const mrr = calcularMrr(assinaturas);
  const serieMrr = serieDeMrr(assinaturas, agora, 12);

  // A série de clientes conta só quem está ativo hoje, pela data em que
  // nasceu, para o último ponto ser o mesmo número exibido ao lado dela.
  const ativos = tenants.filter((t) => t.status === "active");
  const serieClientes = serieAcumulada(
    ativos.map((t) => t.createdAt),
    agora,
    12
  );

  const diario = preencherDias(linhasDiarias, agora, 365);
  const somaDePedidos = (de: number, ate?: number) =>
    diario.slice(de, ate).reduce((s, p) => s + p.pedidos, 0);
  const pedidos30 = somaDePedidos(-30);
  const pedidosAntes = somaDePedidos(-60, -30);
  const semanasDePedidos = Array.from({ length: 12 }, (_, i) =>
    somaDePedidos(diario.length - 84 + i * 7, diario.length - 84 + (i + 1) * 7)
  );

  const criacoesDeLeads = leads.map((l) => l.createdAt);
  const amanha = new Date(agora.getTime() + DIA_EM_MS);
  const leads30 = contarEntre(criacoesDeLeads, ha(30), amanha);
  const leadsAntes = contarEntre(criacoesDeLeads, ha(60), ha(30));

  const ultimo = (s: { valor: number }[], recuo = 0) =>
    s[s.length - 1 - recuo]?.valor ?? 0;

  const kpis: KpiDoResumo[] = [
    {
      chave: "receita",
      rotulo: "Receita",
      ajuda:
        "Receita recorrente contratada: a soma das mensalidades de toda assinatura não cancelada. Não é o que foi recebido.",
      icone: "carteira",
      valor: mrr,
      moeda: true,
      variacao: variacao(ultimo(serieMrr), ultimo(serieMrr, 1)),
      comparacao: "vs mês passado",
      serie: serieMrr.map((p) => p.valor),
    },
    {
      chave: "clientes",
      rotulo: "Clientes",
      ajuda: "Restaurantes ativos na plataforma.",
      icone: "loja",
      valor: ativos.length,
      moeda: false,
      variacao: variacao(ultimo(serieClientes), ultimo(serieClientes, 1)),
      comparacao: "vs mês passado",
      serie: serieClientes.map((p) => p.valor),
    },
    {
      chave: "pedidos",
      rotulo: "Pedidos",
      ajuda:
        "Pedidos feitos em todos os cardápios nos últimos 30 dias, sem os cancelados.",
      icone: "sacola",
      valor: pedidos30,
      moeda: false,
      variacao: variacao(pedidos30, pedidosAntes),
      comparacao: "vs 30 dias antes",
      serie: semanasDePedidos,
    },
    {
      chave: "leads",
      rotulo: "Leads",
      ajuda: "Leads que entraram nos últimos 30 dias, de todas as origens.",
      icone: "pessoa",
      valor: leads30,
      moeda: false,
      variacao: variacao(leads30, leadsAntes),
      comparacao: "vs 30 dias antes",
      serie: montarSemanas(criacoesDeLeads, agora, 12).map((s) => s.leads),
    },
  ];

  // ---- Blocos de apoio ----------------------------------------------------

  const pauta = montarPauta(leads, agora);
  const semLeads = pauta[0].chave === "sem-leads";
  const abertos = contarLeadsAbertos(leads);

  const contagens = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});

  const recebido = recebidoPorMes(pagas, agora, 12);
  const recebidoNoAno = recebido.reduce((s, p) => s + p.valor, 0);

  const semanasDeLeads = montarSemanas(criacoesDeLeads, agora, 8);

  const nomes = new Map(tenants.map((t) => [t.id, t.nome]));
  const ranking = porRestaurante.map((r) => ({
    id: r.tenantId,
    nome: nomes.get(r.tenantId) ?? "Restaurante removido",
    pedidos: r._count._all,
    volume: Number(r._sum.total ?? 0),
  }));

  const aReceber = emAberto.reduce((s, c) => s + Number(c.valor), 0);
  const vencidas = emAberto.filter((c) => diasDeAtraso(c.vencimento, agora) > 0);

  return (
    <div className="space-y-4 sm:space-y-5">
      <h1 className="console-entra text-[32px] sm:text-[44px] font-semibold tracking-[-0.04em] leading-none pt-2 pb-3 sm:pb-5">
        <span className="text-console-tinta">Visão</span>{" "}
        <span className="text-console-segunda">geral</span>
      </h1>

      <Painel titulo="Resumo" atraso={60}>
        <VisaoGeralKpis kpis={kpis} />
      </Painel>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <Painel atraso={140} className="lg:col-span-2">
          <GraficoAtividade dias={diario} />
        </Painel>

        <Painel
          titulo="Pauta"
          subtitulo={`${abertos} ${abertos === 1 ? "lead aberto" : "leads abertos"}`}
          atraso={200}
        >
          <ul className="space-y-2.5">
            {pauta.map((item) => (
              <li
                key={item.chave}
                className="flex items-start gap-3 rounded-2xl bg-console-tinta/[0.035] px-4 py-3.5"
              >
                <span
                  aria-hidden
                  className={`mt-[7px] size-2 shrink-0 rounded-full ${TOM_DA_PAUTA[item.chave]}`}
                />
                <span className="text-[15px] font-medium leading-snug">
                  {item.texto}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href={semLeads ? "/leads" : "/leads?estagio=NOVO"}
            className="mt-5 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-console-campo text-console-sobre-campo text-[14px] font-semibold hover:bg-console-campo-esc transition-colors"
          >
            {semLeads ? "Cadastrar o primeiro" : "Abrir leads"}
            <ArrowUpRight size={16} strokeWidth={2.2} />
          </Link>
        </Painel>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <Painel
          titulo="Receita recebida"
          subtitulo="cobranças pagas, mês a mês"
          atraso={260}
          className="lg:col-span-2"
          acessorio={
            <div className="text-right shrink-0">
              <p className="text-[12px] text-console-mudo">12 meses</p>
              <p className="tabular text-[20px] font-semibold tracking-[-0.02em]">
                {formatCurrency(recebidoNoAno)}
              </p>
            </div>
          }
        >
          <GraficoBarras
            moeda
            barras={recebido.map((p) => ({
              rotulo: p.rotulo,
              valor: p.valor,
              titulo: rotuloDoMes(p.chave, true),
            }))}
          />
        </Painel>

        <Painel
          titulo="Funil"
          subtitulo={`${leads.length} ${leads.length === 1 ? "lead" : "leads"} no total`}
          atraso={320}
        >
          <FunilBarras contagens={contagens} />
        </Painel>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <Painel
          titulo="Entrada de leads"
          subtitulo="por semana; a listrada ainda não fechou"
          atraso={380}
        >
          <GraficoBarras
            className="h-[180px] sm:h-[220px]"
            unidade={["lead", "leads"]}
            ultimaEmCurso
            barras={semanasDeLeads.map((s) => ({
              rotulo: s.semana,
              valor: s.leads,
              titulo: `semana de ${s.semana}`,
            }))}
          />
        </Painel>

        <Painel
          titulo="Quem mais vende"
          subtitulo="pedidos nos últimos 30 dias"
          atraso={440}
        >
          <RankingRestaurantes itens={ranking} />
        </Painel>

        <Painel
          titulo="Cobranças"
          subtitulo={
            emAberto.length === 0
              ? "nada a receber"
              : `${formatCurrency(aReceber)} a receber${
                  vencidas.length > 0
                    ? `, ${vencidas.length} ${vencidas.length === 1 ? "vencida" : "vencidas"}`
                    : ""
                }`
          }
          atraso={500}
          acessorio={
            emAberto.length > 0 ? (
              <Link
                href="/clientes"
                className="shrink-0 inline-flex items-center gap-1 h-9 px-3 rounded-xl border border-console-linha bg-console-cartao text-[13px] font-medium hover:border-console-mudo transition-colors"
              >
                Dar baixa
                <ArrowUpRight size={15} />
              </Link>
            ) : undefined
          }
        >
          {emAberto.length === 0 ? (
            <p className="text-[14px] text-console-mudo py-10 text-center">
              Toda cobrança emitida foi paga.
            </p>
          ) : (
            <ul className="-my-3 divide-y divide-console-linha">
              {emAberto.slice(0, 5).map((c) => {
                const dias = diasDeAtraso(c.vencimento, agora);
                const nome = c.assinatura.tenant.nome;
                return (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="size-10 shrink-0 rounded-full bg-console-suave flex items-center justify-center text-[14px] font-semibold text-console-segunda">
                        {nome.trim().charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[15px] font-medium truncate">{nome}</p>
                        <p className="text-[12px] text-console-mudo">
                          {c.competencia.split("-").reverse().join("/")}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="tabular text-[15px] font-semibold">
                        {formatCurrency(Number(c.valor))}
                      </p>
                      <p
                        className={`text-[12px] font-medium ${
                          dias > 0 ? "text-console-alerta" : "text-console-mudo"
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
        </Painel>
      </section>
    </div>
  );
}
