import { AlertTriangle, Lock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { withRequestTenant } from "@/lib/tenant-request";
import { formatCurrency } from "@/lib/utils";
import { avisoDeAtraso } from "@/lib/assinatura/aviso";
import { proximoVencimento } from "@/lib/assinatura/competencia";
import { BLOQUEIO_DIAS, diasDeAtraso } from "@/lib/assinatura/regua";

/**
 * A tela da mensalidade do restaurante.
 *
 * É a única tela de gestão que continua aberta com a assinatura BLOQUEADA
 * (ver ADM_LIVRE_DE_BLOQUEIO em src/proxy.ts), então ela não é só extrato:
 * é o lugar onde o dono descobre o que aconteceu e o que fazer. Daí o cuidado
 * com o texto — em nenhum estado ele pode dar a entender que o cardápio saiu
 * do ar, porque o cardápio nunca sai.
 */

/**
 * Vencimento é data de calendário, gravada à meia-noite UTC. Formatar no fuso
 * do servidor mostraria o dia anterior em qualquer fuso a oeste de Greenwich —
 * uma fatura do dia 10 virando dia 9 na tela do cliente.
 */
function formatarData(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(data);
}

/**
 * `pagoEm`, ao contrário do vencimento, é um instante de verdade — a hora em
 * que a baixa entrou. Ele se formata no fuso de Brasília, porque um pagamento
 * das 22h vira o dia seguinte se lido em UTC.
 */
function formatarInstante(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

/** "2026-08" vira "08/2026". */
function formatarCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

type StatusCobranca = "PENDENTE" | "PAGA" | "VENCIDA" | "CANCELADA";

/**
 * O job diário move o status da assinatura, mas não reescreve o status de cada
 * cobrança — uma fatura atrasada segue PENDENTE no banco. Mostrar "em aberto"
 * numa cobrança de 20 dias seria mentir por omissão, então o rótulo olha a
 * data, como o resto da régua.
 */
function rotuloDaCobranca(
  cobranca: { status: StatusCobranca; vencimento: Date },
  agora: Date
): { texto: string; classe: string } {
  if (cobranca.status === "PAGA") return { texto: "Paga", classe: "text-green-700" };
  if (cobranca.status === "CANCELADA")
    return { texto: "Cancelada", classe: "text-neutral-400" };
  return diasDeAtraso(cobranca.vencimento, agora) >= 1
    ? { texto: "Vencida", classe: "text-red-700" }
    : { texto: "Em aberto", classe: "text-amber-700" };
}

export default async function AssinaturaPage() {
  // O tenant vem do x-tenant-id que o proxy injetou, como nas outras telas
  // servidas por Server Component. O tenantId vai explícito no where mesmo
  // rodando pelo client com escopo: Assinatura está em TENANT_SCOPED_MODELS
  // para que esta consulta se corrija sozinha se alguém apagar o filtro, não
  // para que ninguém precise escrevê-lo.
  //
  // O `await` precisa ficar DENTRO do withRequestTenant. PrismaPromise é
  // preguiçosa: devolvê-la sem esperar faz a query começar depois que o
  // AsyncLocalStorage já saiu de escopo, e a extensão de tenant estoura com
  // "Nenhum tenant no contexto da request".
  const assinatura = await withRequestTenant(async (tenantId) =>
    await prisma.assinatura.findFirst({
      where: { tenantId },
      select: {
        valorMensal: true,
        diaVencimento: true,
        inicioCobranca: true,
        status: true,
        cobrancas: {
          orderBy: { vencimento: "desc" },
          select: {
            id: true,
            competencia: true,
            valor: true,
            vencimento: true,
            status: true,
            pagoEm: true,
          },
        },
      },
    })
  );

  const cabecalho = (
    <>
      <h1 className="text-2xl font-bold text-neutral-900 mb-1">Assinatura</h1>
      <p className="text-sm text-neutral-400 mb-8">
        Sua mensalidade da Muno e o histórico de cobranças
      </p>
    </>
  );

  // Restaurante em implantação, em cortesia negociada ou anterior à régua.
  // Ausência de assinatura não é pendência, e o proxy também não bloqueia
  // ninguém por isso.
  if (!assinatura) {
    return (
      <div>
        {cabecalho}
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <p className="text-sm text-neutral-600 leading-relaxed">
            Ainda não há mensalidade cadastrada para o seu restaurante. Nada a
            pagar por aqui — a equipe da Muno avisa quando a cobrança começar.
          </p>
        </div>
      </div>
    );
  }

  const agora = new Date();
  const emCortesia = assinatura.inicioCobranca > agora;

  // A cobrança em aberto mais antiga é o que manda em tudo nesta tela: no
  // aviso, no próximo vencimento e no texto do bloqueio. O status da
  // assinatura fica em ATIVA nos seis primeiros dias de atraso, então lê-lo
  // aqui deixaria a tela dizendo "em dia" para quem está devendo.
  const emAberto = assinatura.cobrancas
    .filter((c) => c.status === "PENDENTE" || c.status === "VENCIDA")
    .sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime());
  const maisAntiga = emAberto[0] ?? null;
  const aviso = avisoDeAtraso(maisAntiga?.vencimento ?? null, agora);
  const proximo = proximoVencimento(assinatura, maisAntiga?.vencimento ?? null, agora);

  const bloqueada = assinatura.status === "BLOQUEADA";
  const cancelada = assinatura.status === "CANCELADA";

  const situacao = bloqueada
    ? { texto: "Gestão suspensa", classe: "text-red-600" }
    : cancelada
      ? { texto: "Encerrada", classe: "text-neutral-500" }
      : aviso
        ? { texto: "Pagamento em atraso", classe: "text-orange-500" }
        : emCortesia
          ? { texto: "Em cortesia", classe: "text-blue-600" }
          : { texto: "Em dia", classe: "text-green-600" };

  const totalEmAberto = emAberto.reduce((soma, c) => soma + Number(c.valor), 0);

  return (
    <div>
      {cabecalho}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">
            Situação
          </p>
          <p className={`text-2xl font-bold mt-1 ${situacao.classe}`}>
            {situacao.texto}
          </p>
          <p className="text-xs text-neutral-400 mt-0.5">
            {emAberto.length === 0
              ? "nenhuma cobrança em aberto"
              : emAberto.length === 1
                ? "1 cobrança em aberto"
                : `${emAberto.length} cobranças em aberto`}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">
            Mensalidade
          </p>
          <p className="text-2xl font-bold text-neutral-900 mt-1">
            {formatCurrency(Number(assinatura.valorMensal))}
          </p>
          <p className="text-xs text-neutral-400 mt-0.5">
            todo dia {assinatura.diaVencimento}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">
            {cancelada ? "Encerrada em" : "Próximo vencimento"}
          </p>
          <p className="text-2xl font-bold text-neutral-900 mt-1">
            {cancelada ? "—" : formatarData(proximo)}
          </p>
          <p className="text-xs text-neutral-400 mt-0.5">
            {cancelada
              ? "sem novas cobranças"
              : emCortesia
                ? "primeira cobrança"
                : totalEmAberto > 0
                  ? `${formatCurrency(totalEmAberto)} em aberto`
                  : "próxima cobrança"}
          </p>
        </div>
      </div>

      {/* O painel do bloqueio. O que ele precisa deixar claro, nesta ordem: o
          cardápio não caiu, o que exatamente parou, e como voltar. */}
      {bloqueada && (
        <div className="flex gap-3 bg-red-50 border border-red-300 rounded-xl p-5 mb-6">
          <Lock size={20} className="text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-900 leading-relaxed space-y-2">
            <p className="font-semibold">
              O acesso à gestão está suspenso por falta de pagamento.
            </p>
            <p>
              <strong>
                Seu cardápio continua no ar e os pedidos continuam entrando
                normalmente.
              </strong>{" "}
              Nada mudou para os seus clientes. As telas de Pedidos e Chats
              seguem abertas, para você não deixar ninguém esperando.
            </p>
            <p>
              O que ficou suspenso são as telas de gestão: cardápio,
              configurações, relatórios e cadastros.
            </p>
            <p>
              Para liberar, pague {emAberto.length === 1 ? "a cobrança" : "as cobranças"}{" "}
              em aberto abaixo{totalEmAberto > 0 ? ` (${formatCurrency(totalEmAberto)})` : ""}.
              Assim que o pagamento for registrado, o acesso volta sozinho — não
              é preciso pedir liberação.
            </p>
          </div>
        </div>
      )}

      {/* Atraso ainda sem bloqueio: a mesma explicação, na dose de quem ainda
          tem tempo de resolver. */}
      {!bloqueada && aviso && (
        <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 leading-relaxed space-y-2">
            <p>
              Sua mensalidade está vencida{" "}
              <strong>
                {aviso.dias === 1 ? "há 1 dia" : `há ${aviso.dias} dias`}
              </strong>
              . Pague a cobrança em aberto abaixo para continuar com o acesso à
              gestão.
            </p>
            <p>
              Com {BLOQUEIO_DIAS} dias de atraso o acesso às telas de gestão é
              suspenso. Mesmo nesse caso{" "}
              <strong>seu cardápio continua no ar recebendo pedidos</strong> — o
              que você perde é o painel, não a operação.
            </p>
          </div>
        </div>
      )}

      {cancelada && (
        <div className="bg-white rounded-xl border border-neutral-200 p-5 mb-6">
          <p className="text-sm text-neutral-600 leading-relaxed">
            Sua assinatura foi encerrada e não há novas cobranças. O histórico
            abaixo continua disponível.
          </p>
        </div>
      )}

      <h2 className="text-sm font-bold text-neutral-900 mb-3">
        Histórico de cobranças
      </h2>

      {assinatura.cobrancas.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <p className="text-sm text-neutral-500">
            {emCortesia
              ? `Nenhuma cobrança ainda. A primeira vence em ${formatarData(assinatura.inicioCobranca)}.`
              : "Nenhuma cobrança emitida até agora."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="border-b border-neutral-100 text-left">
                <th className="px-5 py-3 text-xs text-neutral-400 font-medium uppercase tracking-wide">
                  Competência
                </th>
                <th className="px-5 py-3 text-xs text-neutral-400 font-medium uppercase tracking-wide">
                  Valor
                </th>
                <th className="px-5 py-3 text-xs text-neutral-400 font-medium uppercase tracking-wide">
                  Vencimento
                </th>
                <th className="px-5 py-3 text-xs text-neutral-400 font-medium uppercase tracking-wide">
                  Situação
                </th>
                <th className="px-5 py-3 text-xs text-neutral-400 font-medium uppercase tracking-wide">
                  Pagamento
                </th>
              </tr>
            </thead>
            <tbody>
              {assinatura.cobrancas.map((cobranca) => {
                const rotulo = rotuloDaCobranca(cobranca, agora);
                return (
                  <tr
                    key={cobranca.id}
                    className="border-b border-neutral-50 last:border-0"
                  >
                    <td className="px-5 py-3 text-neutral-900 font-medium">
                      {formatarCompetencia(cobranca.competencia)}
                    </td>
                    <td className="px-5 py-3 text-neutral-600">
                      {formatCurrency(Number(cobranca.valor))}
                    </td>
                    <td className="px-5 py-3 text-neutral-600">
                      {formatarData(cobranca.vencimento)}
                    </td>
                    <td className={`px-5 py-3 font-medium ${rotulo.classe}`}>
                      {rotulo.texto}
                    </td>
                    <td className="px-5 py-3 text-neutral-600">
                      {cobranca.pagoEm ? formatarInstante(cobranca.pagoEm) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
