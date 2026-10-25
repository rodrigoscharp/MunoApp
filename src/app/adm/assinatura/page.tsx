import { AlertTriangle, Lock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getRequestTenantPlano, withRequestTenant } from "@/lib/tenant-request";
import { UpgradeMesaQr } from "@/components/adm/UpgradeMesaQr";
import { formatCurrency } from "@/lib/utils";
import { avisoDeAtraso } from "@/lib/assinatura/aviso";
import { proximoVencimento } from "@/lib/assinatura/competencia";
import {
  BLOQUEIO_DIAS_UTEIS,
  situacaoDaCobranca,
  type SituacaoCobranca,
} from "@/lib/assinatura/regua";
import {
  formatarCompetencia,
  formatarData,
  formatarInstante,
} from "@/lib/assinatura/formato";
import { CabecalhoDaTela } from "@/components/painel/CabecalhoDaTela";
import { Selo, type TomDoSelo } from "@/components/painel/Selo";
import { cartaoPainel, kicker, linhaDeTabela, rotulo as rotuloDeTabela } from "@/components/painel/estilos";

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
const ROTULO_DA_SITUACAO: Record<
  SituacaoCobranca,
  { texto: string; tom: TomDoSelo }
> = {
  PAGA: { texto: "Paga", tom: "pago" },
  CANCELADA: { texto: "Cancelada", tom: "neutro" },
  VENCIDA: { texto: "Vencida", tom: "alerta" },
  EM_ABERTO: { texto: "Em aberto", tom: "andamento" },
};

/** Cartão de número do topo: rótulo, valor em manchete e a linha de apoio. */
function CartaoDeNumero({
  rotulo,
  valor,
  apoio,
  classeDoValor = "text-forest-dark",
}: {
  rotulo: string;
  valor: React.ReactNode;
  apoio: React.ReactNode;
  classeDoValor?: string;
}) {
  return (
    <div className={`${cartaoPainel} p-5`}>
      <p className={`${kicker} text-loja-tinta-2`}>{rotulo}</p>
      <p className={`manchete mt-2 text-[2rem] leading-none ${classeDoValor}`}>{valor}</p>
      <p className="mt-1.5 text-[12.5px] text-loja-tinta-2">{apoio}</p>
    </div>
  );
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
  // O plano vem do header que o proxy injeta (x-tenant-plano), então saber se
  // cabe oferta de upgrade não custa consulta nenhuma.
  const plano = await getRequestTenantPlano();

  const assinatura = await withRequestTenant(async (tenantId) =>
    await prisma.assinatura.findFirst({
      where: { tenantId },
      select: {
        valorMensal: true,
        diaVencimento: true,
        inicioCobranca: true,
        ciclo: true,
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
      <CabecalhoDaTela contexto="Sua mensalidade da Muno" titulo="Assinatura" />
      <p className="-mt-3 mb-6 text-[14px] text-loja-tinta-2">
        A mensalidade e o histórico de cobranças
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
        <div className={`${cartaoPainel} p-6`}>
          <p className="text-[14px] leading-relaxed text-loja-tinta">
            Ainda não há mensalidade cadastrada para o seu restaurante. Nada a
            pagar por aqui, a equipe da Muno avisa quando a cobrança começar.
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
    ? { texto: "Gestão suspensa", classe: "text-[#A3271A]" }
    : cancelada
      ? { texto: "Encerrada", classe: "text-loja-tinta-2" }
      : aviso
        ? { texto: "Pagamento em atraso", classe: "text-loja-preco" }
        : emCortesia
          ? { texto: "Em cortesia", classe: "text-forest" }
          : { texto: "Em dia", classe: "text-forest-dark" };

  const totalEmAberto = emAberto.reduce((soma, c) => soma + Number(c.valor), 0);

  return (
    <div>
      {cabecalho}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CartaoDeNumero
          rotulo="Situação"
          valor={situacao.texto}
          classeDoValor={situacao.classe}
          apoio={
            emAberto.length === 0
              ? "nenhuma cobrança em aberto"
              : emAberto.length === 1
                ? "1 cobrança em aberto"
                : `${emAberto.length} cobranças em aberto`
          }
        />

        <CartaoDeNumero
          rotulo="Mensalidade"
          valor={formatCurrency(Number(assinatura.valorMensal))}
          apoio={`todo dia ${assinatura.diaVencimento}`}
        />

        <CartaoDeNumero
          rotulo={cancelada ? "Encerrada em" : "Próximo vencimento"}
          valor={cancelada ? "—" : formatarData(proximo)}
          apoio={
            cancelada
              ? "sem novas cobranças"
              : emCortesia
                ? "primeira cobrança"
                : totalEmAberto > 0
                  ? `${formatCurrency(totalEmAberto)} em aberto`
                  : "próxima cobrança"
          }
        />
      </div>

      {/* A oferta só para quem está no plano de baixo, e só com a assinatura
          saudável. Oferecer upgrade a quem está devendo é de mau gosto, e
          disputa atenção com a única tela que resolve a pendência: esta é a
          única de gestão que continua aberta no bloqueio. */}
      {plano === "MEMBRO" && !bloqueada && !cancelada && !aviso && <UpgradeMesaQr />}

      {/* O painel do bloqueio. O que ele precisa deixar claro, nesta ordem: o
          cardápio não caiu, o que exatamente parou, e como voltar. */}
      {bloqueada && (
        <div role="alert" className="mb-6 flex gap-3 rounded-[22px] bg-[#FBE3DC] p-5">
          <Lock size={20} className="mt-0.5 shrink-0 text-[#A3271A]" aria-hidden />
          <div className="space-y-2 text-[14px] leading-relaxed text-[#5A1A10]">
            <p className="font-extrabold">
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
        <div role="status" className="mb-6 flex gap-3 rounded-[22px] bg-loja-pessego-claro p-5">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-loja-preco" aria-hidden />
          <div className="space-y-2 text-[14px] leading-relaxed text-[#6A2E10]">
            <p>
              Sua mensalidade está vencida{" "}
              <strong>
                {aviso.dias === 1 ? "há 1 dia" : `há ${aviso.dias} dias`}
              </strong>
              . Pague a cobrança em aberto abaixo para continuar com o acesso à
              gestão.
            </p>
            <p>
              Com {BLOQUEIO_DIAS_UTEIS} dias úteis de atraso o acesso às telas de gestão é
              suspenso. Mesmo nesse caso{" "}
              <strong>seu cardápio continua no ar recebendo pedidos</strong> — o
              que você perde é o painel, não a operação.
            </p>
          </div>
        </div>
      )}

      {cancelada && (
        <div className={`${cartaoPainel} mb-6 p-5`}>
          <p className="text-[14px] leading-relaxed text-loja-tinta">
            Sua assinatura foi encerrada e não há novas cobranças. O histórico
            abaixo continua disponível.
          </p>
        </div>
      )}

      <h2 className="manchete mb-3 text-[1.6rem] text-forest-dark">
        Histórico de cobranças
      </h2>

      {assinatura.cobrancas.length === 0 ? (
        <div className={`${cartaoPainel} p-6`}>
          <p className="text-[14px] text-loja-tinta-2">
            {emCortesia
              ? `Nenhuma cobrança ainda. A primeira vence em ${formatarData(assinatura.inicioCobranca)}.`
              : "Nenhuma cobrança emitida até agora."}
          </p>
        </div>
      ) : (
        <div className={`${cartaoPainel} overflow-x-auto`}>
          <table className="w-full min-w-[560px] text-[14px]">
            <thead>
              <tr className="text-left">
                <th scope="col" className={`px-5 py-3.5 ${rotuloDeTabela}`}>Competência</th>
                <th scope="col" className={`px-5 py-3.5 ${rotuloDeTabela}`}>Valor</th>
                <th scope="col" className={`px-5 py-3.5 ${rotuloDeTabela}`}>Vencimento</th>
                <th scope="col" className={`px-5 py-3.5 ${rotuloDeTabela}`}>Situação</th>
                <th scope="col" className={`px-5 py-3.5 ${rotuloDeTabela}`}>Pagamento</th>
              </tr>
            </thead>
            <tbody>
              {assinatura.cobrancas.map((cobranca) => {
                const rotulo = ROTULO_DA_SITUACAO[situacaoDaCobranca(cobranca, agora)];
                return (
                  <tr key={cobranca.id} className={linhaDeTabela}>
                    <td className="px-5 py-3.5 font-bold text-loja-tinta">
                      {formatarCompetencia(cobranca.competencia)}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-loja-tinta">
                      {formatCurrency(Number(cobranca.valor))}
                    </td>
                    <td className="px-5 py-3.5 text-loja-tinta-2">
                      {formatarData(cobranca.vencimento)}
                    </td>
                    <td className="px-5 py-3.5">
                      <Selo tom={rotulo.tom}>{rotulo.texto}</Selo>
                    </td>
                    <td className="px-5 py-3.5 text-loja-tinta-2">
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
