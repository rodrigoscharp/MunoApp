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
  NOVO: "bg-console-selo-laranja text-[#141414]",
  CONTATADO: "bg-console-tinta/[0.07] text-console-segunda",
  NEGOCIACAO: "bg-console-selo-verde text-[#141414]",
  FECHADO: "bg-console-positivo-fundo text-console-positivo",
  PERDIDO: "bg-console-tinta/[0.06] text-console-mudo",
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
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between gap-3 pt-2 pb-1 sm:pb-3">
        <h1 className="text-[30px] sm:text-[40px] font-semibold tracking-[-0.04em] leading-none">
          Funil <span className="text-console-segunda">de leads</span>
        </h1>
        <NovoLeadForm />
      </div>

      {/* O filtro é link, e não estado de cliente: assim um estágio é
          endereçável, e "me manda os que estão em negociação" é uma URL.
          No celular a fileira rola na horizontal em vez de quebrar em três
          linhas de pílula, que empurrariam a lista para fora da tela. */}
      <nav className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
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

      <div className="console-vidro rounded-[22px] sm:rounded-[28px] overflow-hidden">
        {/* Cabeçalho só no desktop: no celular cada linha vira um cartão e o
            rótulo de coluna não teria a que se referir. */}
        <div className="hidden md:grid grid-cols-[minmax(0,2.2fr)_1fr_1fr_1fr_1fr] gap-4 px-6 py-3 text-[12px] text-console-mudo border-b border-console-linha">
          <span>restaurante</span>
          <span>origem</span>
          <span>entrou</span>
          <span className="text-right">mensalidade</span>
          <span className="text-right">situação</span>
        </div>

        {visiveis.length === 0 ? (
          <p className="text-console-mudo text-center py-16 text-sm">
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
                    className="flex md:grid md:grid-cols-[minmax(0,2.2fr)_1fr_1fr_1fr_1fr] items-center gap-3 md:gap-4 px-4 sm:px-6 py-3.5 hover:bg-console-tinta/[0.03] transition"
                  >
                    {/* A inicial no círculo existe para o celular: numa lista
                        de nomes parecidos, ela é o ponto de retorno do olho
                        quando se rola a tela. */}
                    <span
                      aria-hidden
                      className="md:hidden size-10 shrink-0 rounded-full bg-console-suave flex items-center justify-center text-[14px] font-semibold text-console-segunda"
                    >
                      {lead.restaurante.trim().charAt(0).toUpperCase()}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{lead.restaurante}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-lg ${CLASSE_DO_ESTAGIO[lead.status as Estagio]}`}
                        >
                          {ROTULOS[lead.status as Estagio] ?? lead.status}
                        </span>
                        <span className="text-[12px] text-console-mudo truncate">
                          {lead.cidade ? `${lead.cidade} · ` : ""}
                          {haQuantoTempo(lead.createdAt, agora)}
                        </span>
                      </div>
                    </div>

                    <span className="hidden md:block text-[14px] text-console-segunda md:self-center">
                      {lead.origem}
                    </span>

                    <span className="hidden md:block text-[14px] text-console-segunda md:self-center">
                      {haQuantoTempo(lead.createdAt, agora)}
                    </span>

                    {/* No celular, mensalidade e situação viram uma coluna à
                        direita, e o travessão de "não tem" some: numa venda
                        que ainda não fechou ele é uma coluna inteira de nada. */}
                    <span className="shrink-0 text-right md:contents">
                      <span className="tabular block text-[14px] font-semibold md:font-normal md:text-right md:self-center">
                        {assinatura
                          ? formatCurrency(Number(assinatura.valorMensal))
                          : <span className="text-console-mudo md:inline hidden">—</span>}
                      </span>
                      <span
                        className={`block text-[12px] md:text-[14px] md:text-right md:self-center ${
                          situacao ? CLASSE_DO_TOM[situacao.tom] : "text-console-mudo"
                        }`}
                      >
                        {situacao ? situacao.texto : <span className="hidden md:inline">—</span>}
                      </span>
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
      className={`shrink-0 whitespace-nowrap text-[13px] px-3.5 h-9 inline-flex items-center gap-1.5 rounded-xl border transition ${
        ativo
          ? "bg-console-campo text-console-sobre-campo border-transparent font-semibold"
          : "bg-console-cartao border-console-linha text-console-segunda hover:text-console-tinta hover:border-console-mudo"
      }`}
    >
      {children}
    </Link>
  );
}
