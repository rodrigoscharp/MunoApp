import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import Link from "next/link";
import { NovoLeadForm } from "@/components/platform/NovoLeadForm";
import { formatCurrency } from "@/lib/utils";
import { diasDeAtraso } from "@/lib/assinatura/regua";
import { CLASSE_DO_TOM, situacaoDoCliente } from "@/lib/assinatura/situacao";

/**
 * O funil, com dinheiro dentro.
 *
 * A versão anterior desta tela era uma lista de nomes agrupada por estágio, e
 * ela respondia uma pergunta só: quem está em cada caixa. As perguntas que
 * faltavam são as que fazem alguém abrir o CRM numa segunda de manhã: há quanto
 * tempo esse lead está parado aqui, quanto ele paga, e ele está em dia.
 *
 * Por isso a lista virou grade e ganhou duas colunas de cobrança. Elas ficam
 * vazias para quem ainda não é cliente, e isso é informação: a linha que tem
 * valor e situação é uma venda viva, e a que não tem é uma venda por fazer.
 */

const ORDEM = ["NOVO", "CONTATADO", "NEGOCIACAO", "FECHADO", "PERDIDO"] as const;

type Estagio = (typeof ORDEM)[number];

const ROTULOS: Record<Estagio, string> = {
  NOVO: "novo",
  CONTATADO: "contatado",
  NEGOCIACAO: "em negociação",
  FECHADO: "fechado",
  PERDIDO: "perdido",
};

/** Terracota marca o que está em jogo; o perdido sai de cena em cinza. O
 *  fechado usa o verde do dado, porque ali ele deixou de ser oportunidade e
 *  virou fato. */
const CLASSE_DO_ESTAGIO: Record<Estagio, string> = {
  NOVO: "bg-console-campo/12 text-console-campo",
  CONTATADO: "bg-console-campo/12 text-console-campo",
  NEGOCIACAO: "bg-console-campo/20 text-console-campo",
  FECHADO: "bg-console-dado/15 text-console-dado",
  PERDIDO: "bg-console-tinta/8 text-console-tinta/45",
};

const DIA_EM_MS = 86400000;

function haQuantoTempo(quando: Date, agora: Date): string {
  const dias = Math.floor((agora.getTime() - quando.getTime()) / DIA_EM_MS);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ estagio?: string }>;
}) {
  const session = await authPlatform();
  if (!session?.user) return null;

  const { estagio } = await searchParams;
  const filtro = ORDEM.find((e) => e === estagio) ?? null;

  const leads = await prismaUnscoped.lead.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      tenant: {
        select: {
          slug: true,
          assinatura: {
            select: {
              status: true,
              valorMensal: true,
              inicioCobranca: true,
              // Só o que está em aberto, do mais antigo para o mais novo: é a
              // primeira linha que manda na régua. Puxar o histórico inteiro de
              // todo cliente para exibir uma palavra seria carregar a lista com
              // dado que a tela não mostra.
              cobrancas: {
                where: { status: { in: ["PENDENTE", "VENCIDA"] } },
                orderBy: { vencimento: "asc" },
                take: 1,
                select: { vencimento: true },
              },
            },
          },
        },
      },
    },
  });

  const agora = new Date();
  const contagens = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});

  const visiveis = filtro ? leads.filter((l) => l.status === filtro) : leads;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="display text-[2rem] leading-none">funil</h1>
        <NovoLeadForm />
      </div>

      {/* O filtro é link, e não estado de cliente: assim um estágio é
          endereçável, e "me manda os que estão em negociação" é uma URL. */}
      <nav className="flex flex-wrap gap-1.5">
        <Filtro href="/leads" ativo={filtro === null}>
          todos <span className="tabular opacity-60">{leads.length}</span>
        </Filtro>
        {ORDEM.map((e) => (
          <Filtro
            key={e}
            href={`/leads?estagio=${e}`}
            ativo={filtro === e}
          >
            {ROTULOS[e]}{" "}
            <span className="tabular opacity-60">{contagens[e] ?? 0}</span>
          </Filtro>
        ))}
      </nav>

      <div className="bg-console-cartao rounded-2xl border border-console-linha overflow-hidden">
        {/* Cabeçalho só no desktop: no celular cada linha vira um cartão e o
            rótulo de coluna não teria a que se referir. */}
        <div className="hidden md:grid grid-cols-[minmax(0,2.2fr)_1fr_1fr_1fr_1fr] gap-4 px-5 py-2.5 text-[12px] text-console-tinta/45 border-b border-console-linha">
          <span>restaurante</span>
          <span>origem</span>
          <span>entrou</span>
          <span className="text-right">mensalidade</span>
          <span className="text-right">situação</span>
        </div>

        {visiveis.length === 0 ? (
          <p className="text-console-tinta/45 text-center py-16 text-sm">
            {filtro
              ? "Nenhum lead neste estágio."
              : "Nenhum lead ainda. Cadastre o primeiro."}
          </p>
        ) : (
          <ul className="divide-y divide-console-linha">
            {visiveis.map((lead) => {
              const assinatura = lead.tenant?.assinatura ?? null;
              const vencimento = assinatura?.cobrancas[0]?.vencimento ?? null;

              const situacao = lead.tenantId
                ? situacaoDoCliente({
                    temAssinatura: assinatura !== null,
                    status: assinatura?.status,
                    diasDeAtraso: vencimento
                      ? diasDeAtraso(vencimento, agora)
                      : 0,
                    emCortesia: assinatura
                      ? assinatura.inicioCobranca > agora
                      : false,
                  })
                : null;

              return (
                <li key={lead.id}>
                  <Link
                    href={`/leads/${lead.id}`}
                    className="grid md:grid-cols-[minmax(0,2.2fr)_1fr_1fr_1fr_1fr] gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-console-tinta/[0.03] transition"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{lead.restaurante}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full ${CLASSE_DO_ESTAGIO[lead.status as Estagio]}`}
                        >
                          {ROTULOS[lead.status as Estagio] ?? lead.status}
                        </span>
                        {lead.cidade && (
                          <span className="text-[12px] text-console-tinta/45 truncate">
                            {lead.cidade}
                          </span>
                        )}
                      </div>
                    </div>

                    <span className="text-[14px] text-console-tinta/55 md:self-center">
                      <span className="md:hidden text-console-tinta/35">origem </span>
                      {lead.origem}
                    </span>

                    <span className="text-[14px] text-console-tinta/55 md:self-center">
                      <span className="md:hidden text-console-tinta/35">entrou </span>
                      {haQuantoTempo(lead.createdAt, agora)}
                    </span>

                    <span className="tabular text-[14px] md:text-right md:self-center">
                      {assinatura ? (
                        formatCurrency(Number(assinatura.valorMensal))
                      ) : (
                        <span className="text-console-tinta/25">—</span>
                      )}
                    </span>

                    <span
                      className={`text-[14px] md:text-right md:self-center ${
                        situacao ? CLASSE_DO_TOM[situacao.tom] : "text-console-tinta/25"
                      }`}
                    >
                      {situacao ? situacao.texto : "—"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Filtro({
  href,
  ativo,
  children,
}: {
  href: string;
  ativo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={`text-[13px] px-3 py-1.5 rounded-full border transition ${
        ativo
          ? "bg-console-campo text-console-sobre-campo border-transparent font-semibold"
          : "bg-console-cartao border-console-linha text-console-tinta/60 hover:text-console-tinta"
      }`}
    >
      {children}
    </Link>
  );
}
