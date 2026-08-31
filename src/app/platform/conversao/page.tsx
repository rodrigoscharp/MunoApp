import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import { formatCurrency } from "@/lib/utils";
import {
  coorteMensal,
  conversaoPorOrigem,
  degrausDoFunil,
  formatarTaxa,
  medianaDeDiasAteFechar,
  taxaDeConversao,
  type LeadDaConversao,
} from "@/lib/platform-conversao";

/**
 * A tela que responde "de quantos leads, quantos viraram membro".
 *
 * Ela lê duas fontes de idade diferente, e a diferença importa para quem
 * interpreta os números:
 *
 * * `Lead`, `Tenant` e `Assinatura` existem desde sempre, então a conversão de
 *   lead para cliente tem histórico de verdade desde o primeiro dia.
 * * `EventoFunil` nasceu com a instrumentação, então a escada de visita até
 *   pagamento **só conta o que aconteceu depois do deploy dela**. Evento não
 *   tem passado, e a tela diz isso em vez de deixar a pessoa concluir que o
 *   tráfego caiu.
 *
 * Tudo por prismaUnscoped: é console de plataforma, sem tenant no contexto.
 */
export default async function ConversaoPage() {
  const session = await authPlatform();
  if (!session?.user) return null;

  const [leadsBrutos, eventos, resumo, assinaturas] = await Promise.all([
    prismaUnscoped.lead.findMany({
      select: {
        origem: true,
        tenantId: true,
        createdAt: true,
        tenant: { select: { createdAt: true } },
      },
    }),
    prismaUnscoped.eventoFunil.groupBy({
      by: ["tipo"],
      _count: { _all: true },
    }),
    // O expurgo apaga o evento cru depois de 90 dias e mantém a contagem aqui.
    // Somar as duas fontes é o que impede a escada de encolher sozinha na
    // primeira vez que o cron rodar de verdade.
    prismaUnscoped.resumoDiario.groupBy({
      by: ["tipo"],
      _sum: { n: true },
    }),
    prismaUnscoped.assinatura.findMany({
      where: { status: { not: "CANCELADA" } },
      select: {
        valorMensal: true,
        ciclo: true,
        tenant: { select: { plano: true } },
      },
    }),
  ]);

  const leads: LeadDaConversao[] = leadsBrutos.map((l) => ({
    origem: l.origem,
    tenantId: l.tenantId,
    createdAt: l.createdAt,
    fechadoEm: l.tenant?.createdAt ?? null,
  }));

  const contagens: Record<string, number> = {};
  for (const e of eventos) contagens[e.tipo] = e._count._all;
  for (const r of resumo) {
    contagens[r.tipo] = (contagens[r.tipo] ?? 0) + (r._sum.n ?? 0);
  }

  const total = taxaDeConversao(leads);
  const porOrigem = conversaoPorOrigem(leads);
  const coorteCompleta = coorteMensal(leads, new Date());
  // Meses vazios ANTES do primeiro lead são ruído: eles não dizem "convertemos
  // mal em março", dizem "a Muno ainda não existia". Os vazios do meio ficam,
  // porque ali o zero é informação.
  const inicio = coorteCompleta.findIndex((l) => l.leads > 0);
  const coorte = inicio === -1 ? coorteCompleta.slice(-3) : coorteCompleta.slice(inicio);
  const mediana = medianaDeDiasAteFechar(leads);
  const degraus = degrausDoFunil(contagens);
  const temEvento = degraus.some((d) => d.n > 0);

  const porPlano = new Map<string, { n: number; mrr: number }>();
  for (const a of assinaturas) {
    const chave = `${a.tenant.plano === "MEMBRO_MESA_QR" ? "Membro + Mesas QR" : "Membro"} · ${a.ciclo === "ANUAL" ? "anual" : "mensal"}`;
    const atual = porPlano.get(chave) ?? { n: 0, mrr: 0 };
    porPlano.set(chave, {
      n: atual.n + 1,
      mrr: atual.mrr + Number(a.valorMensal),
    });
  }

  return (
    <div className="space-y-5">
      <h1 className="display text-[2rem] leading-none mb-1">conversão</h1>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          rotulo="lead vira cliente"
          valor={formatarTaxa(total.taxa)}
          apoio={`${total.clientes} de ${total.leads} ${total.leads === 1 ? "lead" : "leads"}`}
          ancora
        />
        <Tile
          rotulo="tempo até fechar"
          valor={mediana === null ? "sem dado" : `${String(mediana).replace(".", ",")}d`}
          apoio="mediana, do lead ao restaurante"
        />
        <Tile
          rotulo="assinaturas"
          valor={String(assinaturas.length)}
          apoio={`${porPlano.size} ${porPlano.size === 1 ? "combinação" : "combinações"} de plano e ciclo`}
        />
        <Tile
          rotulo="leads"
          valor={String(total.leads)}
          apoio={`${porOrigem.length} ${porOrigem.length === 1 ? "origem" : "origens"}`}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Cartao
          titulo="a escada, da visita ao restaurante no ar"
          nota={
            temEvento
              ? "conta só o que aconteceu depois da instrumentação entrar no ar"
              : undefined
          }
        >
          {!temEvento ? (
            <p className="text-sm text-console-tinta/45 py-6">
              Nenhum evento ainda. Esta escada começa a encher no primeiro
              visitante depois do deploy, porque evento não tem passado.
            </p>
          ) : (
            <ol className="space-y-0">
              {degraus.map((d, i) => {
                const maior = Math.max(1, degraus[0].n);
                const anterior = i === 0 ? null : degraus[i - 1].n;
                const saiu = anterior === null ? 0 : anterior - d.n;

                return (
                  <li key={d.chave}>
                    {/* A perda entre um degrau e o seguinte, dita antes do
                        degrau que sobrou. É o número que responde "onde a
                        venda vaza", e por isso ele vem antes, e não como
                        rodapé de uma coluna à direita que o olho não visita. */}
                    {anterior !== null && (
                      <p className="flex items-baseline gap-2 pl-[9.5rem] py-1.5 text-[12px]">
                        <span className="tabular text-console-tinta/70">
                          {formatarTaxa(d.doAnterior)}
                        </span>
                        <span className="text-console-tinta/35">seguiu</span>
                        {saiu > 0 && (
                          <span className="text-console-tinta/35">
                            · {saiu} {saiu === 1 ? "saiu" : "saíram"}
                          </span>
                        )}
                      </p>
                    )}

                    <div className="flex items-center gap-3">
                      <span className="text-[13px] text-console-tinta/55 w-36 shrink-0">
                        {d.rotulo}
                      </span>
                      <span className="flex-1 h-2.5 rounded-full bg-console-tinta/6 overflow-hidden">
                        <span
                          className="block h-full rounded-full bg-console-dado"
                          style={{
                            width: `${d.n === 0 ? 0 : Math.max(2, (d.n / maior) * 100)}%`,
                          }}
                        />
                      </span>
                      <span className="tabular text-[15px] w-12 text-right">
                        {d.n}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Cartao>

        <Cartao titulo="conversão por origem">
          <Tabela
            colunas={["origem", "leads", "clientes", "taxa"]}
            linhas={porOrigem.map((l) => [
              l.rotulo,
              String(l.leads),
              String(l.clientes),
              formatarTaxa(l.taxa),
            ])}
            vazio="Nenhum lead cadastrado ainda."
          />
        </Cartao>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Cartao
          titulo="coorte de entrada"
          nota="a turma que entrou em cada mês, e quanto dela já fechou"
        >
          <Tabela
            colunas={["mês", "leads", "clientes", "taxa"]}
            linhas={coorte.map((l) => [
              l.rotulo,
              String(l.leads),
              String(l.clientes),
              formatarTaxa(l.taxa),
            ])}
            vazio="Sem histórico ainda."
          />
          <p className="text-[12px] text-console-tinta/45 mt-3 leading-snug">
            Os meses recentes aparecem piores do que serão, porque parte da
            turma ainda não teve tempo de fechar.
          </p>
        </Cartao>

        <Cartao titulo="receita por plano e ciclo">
          <Tabela
            colunas={["plano", "assinaturas", "por mês"]}
            linhas={[...porPlano.entries()]
              .sort((a, b) => b[1].mrr - a[1].mrr)
              .map(([chave, v]) => [
                chave,
                String(v.n),
                formatCurrency(Math.round(v.mrr * 100) / 100),
              ])}
            vazio="Nenhuma assinatura ativa."
          />
        </Cartao>
      </section>
    </div>
  );
}

function Tile({
  rotulo,
  valor,
  apoio,
  ancora,
}: {
  rotulo: string;
  valor: string;
  apoio: string;
  ancora?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-5 py-4 ${
        ancora
          ? "bg-console-campo text-console-sobre-campo border-transparent"
          : "bg-console-cartao border-console-linha"
      }`}
    >
      <p
        className={`text-[13px] ${ancora ? "text-console-sobre-campo/70" : "text-console-tinta/45"}`}
      >
        {rotulo}
      </p>
      <p className="tabular text-[1.75rem] leading-tight mt-1">{valor}</p>
      <p
        className={`text-[12px] mt-0.5 ${ancora ? "text-console-sobre-campo/70" : "text-console-tinta/45"}`}
      >
        {apoio}
      </p>
    </div>
  );
}

function Cartao({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-console-cartao rounded-2xl border border-console-linha px-5 py-4 h-full">
      <div className="mb-4">
        <p className="text-[13px] text-console-tinta/45">{titulo}</p>
        {nota && (
          <p className="text-[12px] text-console-tinta/35 mt-0.5">{nota}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Tabela({
  colunas,
  linhas,
  vazio,
}: {
  colunas: string[];
  linhas: string[][];
  vazio: string;
}) {
  if (linhas.length === 0) {
    return <p className="text-sm text-console-tinta/45 py-6">{vazio}</p>;
  }

  return (
    <table className="w-full text-[14px]">
      <thead>
        <tr className="text-[12px] text-console-tinta/45">
          {colunas.map((c, i) => (
            <th
              key={c}
              className={`font-normal pb-2 ${i === 0 ? "text-left" : "text-right"}`}
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-console-linha">
        {linhas.map((linha) => (
          <tr key={linha[0]}>
            {linha.map((celula, i) => (
              <td
                key={i}
                className={`py-2 ${i === 0 ? "" : "text-right tabular"}`}
              >
                {celula}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
