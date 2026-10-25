import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import type { DeliveryType, OrderStatus, PaymentMethod } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getRestaurantInfo } from "@/lib/restaurant";
import {
  ONBOARDING_DISPENSADO,
  deveRedirecionar,
  estaPendente,
} from "@/lib/onboarding";
import { cn, formatCurrency } from "@/lib/utils";
import {
  horarioDePicoEmCache,
  lerAoVivo,
  painelEmCache,
  ultimosPedidos,
  type AoVivo,
  type DadosDoPainel,
  type PedidoRecente,
} from "@/lib/analytics";
import {
  PERIODOS,
  PERIODO_PADRAO,
  ROTULO_DO_PERIODO,
  classificarClientes,
  compararPeriodos,
  dataPorExtenso,
  formatarEspera,
  intervaloDoPeriodo,
  lerPeriodo,
  montarMapaDeCalor,
  nomeCurto,
  saudacao,
  type Periodo,
  type Variacao,
} from "@/lib/painel/periodo";
import { imagemOtimizavel } from "@/lib/imagem-otimizavel";
import { CabecalhoDaTela } from "@/components/painel/CabecalhoDaTela";
import { botaoBrasa, cartaoPainel, kicker, linhaDeTabela, rotulo, tituloDeSecao } from "@/components/painel/estilos";
import { Raminho } from "@/components/loja/Raminho";
import { SELO_DO_PEDIDO, seloBase } from "@/components/loja/selo-do-pedido";
import {
  ComoPediram,
  GraficoDeFaturamento,
  MapaDeCalorDosPedidos,
  MiniBarras,
  descreverPico,
  moedaSemCentavos,
} from "@/components/adm/AdminCharts";

// Cartão de seção do dashboard: o papel do painel com o respiro do mockup.
const secao = `${cartaoPainel} min-w-0 px-[22px] py-5`;

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  // tenantId é opcional no tipo Session (a sessão de plataforma não tem um);
  // aqui o proxy já garantiu um ADMIN de tenant antes de a página rodar.
  const tenantId = session!.user.tenantId!;

  // O estado do onboarding sai dos DADOS, e vem antes de tudo: quem ainda
  // está montando a casa é mandado para /adm/comecar sem pagar as consultas
  // do dashboard, que esta tela nem chegaria a mostrar.
  const [info, dispensa, menuItemCount] = await Promise.all([
    getRestaurantInfo(tenantId),
    prismaUnscoped.setting.findUnique({
      where: { tenantId_key: { tenantId, key: ONBOARDING_DISPENSADO } },
      select: { value: true },
    }),
    prismaUnscoped.menuItem.count({ where: { tenantId } }),
  ]);
  const onboarding = {
    enderecoPreenchido: info.address.trim().length > 0,
    temItem: menuItemCount > 0,
    dispensado: dispensa !== null,
  };

  // O redirecionamento mora AQUI, e não no proxy. O proxy roda em toda
  // requisição e já faz um findUnique de tenant; somar duas consultas ali por
  // uma tela que cada cliente vê uma vez na vida é caro no lugar errado. E o
  // efeito seria pior: quem digita /adm/cardapio direto seria sequestrado no
  // meio do caminho. Aqui só pega quem chega na porta do painel.
  if (deveRedirecionar(onboarding)) redirect("/adm/comecar");

  const periodo = lerPeriodo((await searchParams).periodo);
  const agora = new Date();

  // O período e o mapa de calor vêm do cache por restaurante (src/lib/
  // analytics.ts: hoje 15s, os outros 60s, o calor 5 min). O ao vivo e os
  // últimos pedidos não: "agora" guardado mentiria.
  const [dados, baldes, aoVivo, ultimos] = await Promise.all([
    painelEmCache(tenantId, periodo),
    horarioDePicoEmCache(tenantId),
    lerAoVivo(tenantId),
    ultimosPedidos(tenantId),
  ]);
  const mapa = montarMapaDeCalor(baldes);
  const { atual, rotuloAnterior } = intervaloDoPeriodo(periodo, agora);

  return (
    <div className="flex flex-col gap-[18px]">
      <CabecalhoDaTela
        contexto={dataPorExtenso(agora)}
        titulo={`${saudacao(agora)}, ${info.name || "seu restaurante"}`}
      >
        <SeletorDePeriodo atual={periodo} />
      </CabecalhoDaTela>

      {/* Aparece mesmo com a dispensa gravada: adiar desliga o
          redirecionamento, não o lembrete. Some sozinho quando a casa estiver
          montada, porque a condição é derivada dos dados. */}
      {estaPendente(onboarding) && (
        <section className={`${cartaoPainel} flex flex-wrap items-center gap-4 bg-loja-pessego-claro p-5`}>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold text-forest-dark">Sua casa ainda não está pronta para vender.</p>
            <ul className="mt-1.5 space-y-1 text-[13.5px] text-loja-tinta">
              {!onboarding.enderecoPreenchido && (
                <li>Falta o endereço, que aparece no cardápio dos seus clientes.</li>
              )}
              {!onboarding.temItem && <li>Falta o primeiro item do cardápio.</li>}
            </ul>
          </div>
          <Link href="/adm/comecar" className={`${botaoBrasa} h-11 text-[14px]`}>
            Terminar de configurar
          </Link>
        </section>
      )}

      <FaixaAoVivo aoVivo={aoVivo} agora={agora} />

      <Numeros dados={dados} periodo={periodo} rotuloAnterior={rotuloAnterior} />

      <div className="grid gap-3.5 lg:grid-cols-3">
        <section aria-labelledby="titulo-faturamento" className={`${secao} lg:col-span-2`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="titulo-faturamento" className={tituloDeSecao}>
              Faturamento por dia
            </h2>
            <span className="text-[12px] text-loja-tinta-2">Hoje em destaque · linha tracejada = média</span>
          </div>
          <GraficoDeFaturamento dias={dados.porDia} />
        </section>

        <section aria-labelledby="titulo-como" className={`${secao} flex flex-col gap-4`}>
          <h2 id="titulo-como" className={tituloDeSecao}>
            Como pediram
          </h2>
          <ComoPediram porTipo={dados.porTipo} porPagamento={dados.porPagamento} />
        </section>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-3">
        <section aria-labelledby="titulo-pico" className={`${secao} lg:col-span-2`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="titulo-pico" className={tituloDeSecao}>
              Horário de pico
            </h2>
            <span className="text-[12px] text-loja-tinta-2">
              Pedidos por dia e hora, últimos 30 dias · {descreverPico(mapa)}
            </span>
          </div>
          <MapaDeCalorDosPedidos mapa={mapa} />
        </section>

        <MaisVendidos itens={dados.maisVendidos} />
      </div>

      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        <CartaoDeClientes dados={dados} inicio={atual.inicio} />
        <CartaoDeCupons dados={dados} />
        <CartaoDeEntregas dados={dados} />
      </div>

      <UltimosPedidos pedidos={ultimos} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function SeletorDePeriodo({ atual }: { atual: Periodo }) {
  return (
    <nav aria-label="Período" className="flex rounded-full bg-[#EADCCB] p-1">
      {PERIODOS.map((p) => {
        const ativo = p === atual;
        return (
          <Link
            key={p}
            href={p === PERIODO_PADRAO ? "/adm" : `/adm?periodo=${p}`}
            scroll={false}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "flex h-11 items-center rounded-full px-3.5 text-[13px] transition sm:px-4",
              ativo
                ? "bg-loja-papel font-extrabold text-forest-dark shadow-[0_4px_10px_-6px_rgba(74,48,28,0.35)]"
                : "font-semibold text-[#4E4038] hover:text-forest-dark"
            )}
          >
            {ROTULO_DO_PERIODO[p]}
          </Link>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------

const ROTULO_AO_VIVO: { status: (keyof AoVivo["porStatus"])[]; rotulo: string }[] = [
  { status: ["PENDING"], rotulo: "novo" },
  { status: ["CONFIRMED", "IN_PREPARATION"], rotulo: "em preparo" },
  { status: ["READY"], rotulo: "pronto" },
  { status: ["OUT_FOR_DELIVERY"], rotulo: "a caminho" },
];

// Acima disto a espera do pedido mais antigo vira o selo de alerta.
const ESPERA_QUE_PREOCUPA_MS = 20 * 60_000;

function numeroDoPedido(id: string): string {
  return `#${id.slice(-6).toUpperCase()}`;
}

function FaixaAoVivo({ aoVivo, agora }: { aoVivo: AoVivo; agora: Date }) {
  const grupos = ROTULO_AO_VIVO.map((g) => ({
    rotulo: g.rotulo,
    n: g.status.reduce((s, st) => s + aoVivo.porStatus[st], 0),
  })).filter((g) => g.n > 0);
  const espera = aoVivo.maisAntigo ? agora.getTime() - new Date(aoVivo.maisAntigo.criadoEm).getTime() : 0;

  return (
    <section
      aria-labelledby="titulo-ao-vivo"
      className="relative flex flex-wrap items-center gap-x-6 gap-y-4 overflow-hidden rounded-[22px] bg-forest-dark px-[22px] py-[18px] text-white"
    >
      <Raminho className="pointer-events-none absolute -right-8 -top-10 h-[180px] w-[180px] text-[#3E6A55]" />
      <div className="relative flex flex-col gap-0.5">
        <span className={cn(kicker, "flex items-center gap-1.5 text-[#F2A67F]")}>
          <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-[#9FD3B5]" />
          Agora · ao vivo
        </span>
        <h2 id="titulo-ao-vivo" className="manchete text-[30px] sm:text-[34px]">
          {aoVivo.total === 0
            ? "Nenhum pedido na casa"
            : `${aoVivo.total} ${aoVivo.total === 1 ? "pedido" : "pedidos"} na casa`}
        </h2>
      </div>
      {(grupos.length > 0 || aoVivo.maisAntigo) && (
        <ul className="relative flex flex-wrap gap-2.5">
          {grupos.map((g) => (
            <li
              key={g.rotulo}
              className="flex h-[34px] items-center gap-1.5 rounded-full bg-forest px-3 text-[12.5px] font-bold"
            >
              <strong className="text-[15px]">{g.n}</strong> {g.rotulo}
            </li>
          ))}
          {aoVivo.maisAntigo && (
            <li
              className={cn(
                "flex h-[34px] items-center rounded-full px-3 text-[12.5px] font-bold",
                espera >= ESPERA_QUE_PREOCUPA_MS ? "bg-[#5A2A14] text-[#FDBA8C]" : "bg-forest text-white"
              )}
            >
              {numeroDoPedido(aoVivo.maisAntigo.id)} esperando há {formatarEspera(espera)}
            </li>
          )}
        </ul>
      )}
      <Link
        href="/dashboard"
        className="relative ml-auto flex h-11 items-center gap-2 rounded-full bg-[#E8804F] px-5 text-[14px] font-extrabold text-[#1A0E08] transition hover:bg-[#F2A67F]"
      >
        Abrir cozinha
      </Link>
    </section>
  );
}

// ---------------------------------------------------------------------------

type Tom = "bom" | "ruim" | "neutro";

const TOM_DA_VARIACAO: Record<Tom, string> = {
  bom: "bg-loja-folha text-forest-dark",
  ruim: "bg-loja-pessego-claro text-[#8A3A12]",
  neutro: "bg-[#EFE4D7] text-loja-tinta",
};

function SeloDeVariacao({
  variacao,
  absoluta = false,
  menosEMelhor = false,
  rotuloAnterior,
}: {
  variacao: Variacao;
  /** Mostra a diferença em unidades, não em %. */
  absoluta?: boolean;
  menosEMelhor?: boolean;
  rotuloAnterior: string;
}) {
  const { sentido, pct, delta } = variacao;
  const tom: Tom =
    sentido === "igual" || sentido === "novo"
      ? "neutro"
      : (sentido === "subiu") !== menosEMelhor
        ? "bom"
        : "ruim";
  const valor = absoluta ? String(Math.abs(delta)) : `${Math.abs(pct ?? 0)}%`;
  const visivel =
    sentido === "subiu" ? `▲ ${valor}` : sentido === "caiu" ? `▼ ${valor}` : sentido === "novo" ? "novo" : "igual";
  const falado =
    sentido === "subiu"
      ? `subiu ${valor} em relação a ${rotuloAnterior}`
      : sentido === "caiu"
        ? `caiu ${valor} em relação a ${rotuloAnterior}`
        : sentido === "novo"
          ? `sem movimento ${rotuloAnterior} para comparar`
          : `igual a ${rotuloAnterior}`;
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-[9px] text-[11.5px] font-extrabold", TOM_DA_VARIACAO[tom])}>
      <span aria-hidden="true">{visivel}</span>
      <span className="sr-only">{falado}</span>
    </span>
  );
}

function Numero({
  rotulo: titulo,
  valor,
  selo,
  barras,
  corDasBarras,
  nota,
}: {
  rotulo: string;
  valor: string;
  selo: React.ReactNode;
  barras: number[];
  corDasBarras: string;
  nota: string;
}) {
  return (
    <article className={`${cartaoPainel} flex min-w-0 flex-col gap-2.5 p-4 sm:p-[18px]`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[12.5px] font-bold text-loja-tinta-2">{titulo}</h3>
        {selo}
      </div>
      <span className="manchete truncate text-[30px] leading-none text-forest-dark sm:text-[38px]">{valor}</span>
      <MiniBarras valores={barras} cor={corDasBarras} />
      <span className="text-[11.5px] leading-snug text-loja-tinta-2">{nota}</span>
    </article>
  );
}

/** Faturamento grande sem centavos, pequeno com: "R$ 4.812", "R$ 28,64". */
function moedaDoNumero(v: number): string {
  return v >= 1000 ? moedaSemCentavos(v) : formatCurrency(v);
}

function Numeros({
  dados,
  periodo,
  rotuloAnterior,
}: {
  dados: DadosDoPainel;
  periodo: Periodo;
  rotuloAnterior: string;
}) {
  const { atual, anterior, porDia, porTipo } = dados;
  const ticket = (r: { receita: number; faturados: number }) => (r.faturados > 0 ? r.receita / r.faturados : 0);
  const totalAtual = atual.pedidos + atual.cancelados;
  const pctCancelados = totalAtual > 0 ? (atual.cancelados / totalAtual) * 100 : 0;

  const ticketPorTipo = (["DELIVERY", "PICKUP", "DINE_IN"] as DeliveryType[])
    .map((t) => {
      const linha = porTipo.find((x) => x.tipo === t);
      return linha && linha.faturados > 0 ? `${ROTULO_DO_TIPO[t].toLowerCase()} ${moedaSemCentavos(ticket(linha))}` : null;
    })
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");

  const diasNoPeriodo = periodo === "hoje" ? 1 : porDia.length;

  return (
    <section aria-label="Resumo do período" className="grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-4">
      <Numero
        rotulo="Faturamento"
        valor={moedaDoNumero(atual.receita)}
        selo={<SeloDeVariacao variacao={compararPeriodos(atual.receita, anterior.receita)} rotuloAnterior={rotuloAnterior} />}
        barras={porDia.map((d) => d.receita)}
        corDasBarras="bg-loja-brasa"
        nota={`vs. ${moedaDoNumero(anterior.receita)} ${rotuloAnterior}`}
      />
      <Numero
        rotulo="Pedidos"
        valor={String(atual.pedidos)}
        selo={<SeloDeVariacao variacao={compararPeriodos(atual.pedidos, anterior.pedidos)} rotuloAnterior={rotuloAnterior} />}
        barras={porDia.map((d) => d.pedidos)}
        corDasBarras="bg-forest-dark"
        nota={
          diasNoPeriodo <= 1
            ? `vs. ${anterior.pedidos} ${rotuloAnterior}`
            : atual.pedidos > 0 && atual.pedidos < diasNoPeriodo
              ? "menos de 1 por dia em média"
              : `${(atual.pedidos / diasNoPeriodo).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por dia em média`
        }
      />
      <Numero
        rotulo="Ticket médio"
        valor={formatCurrency(ticket(atual))}
        selo={<SeloDeVariacao variacao={compararPeriodos(ticket(atual), ticket(anterior))} rotuloAnterior={rotuloAnterior} />}
        barras={porDia.map((d) => (d.faturados > 0 ? d.receita / d.faturados : 0))}
        corDasBarras="bg-loja-brasa"
        nota={ticketPorTipo || "por pedido faturado"}
      />
      <Numero
        rotulo="Cancelados"
        valor={String(atual.cancelados)}
        selo={
          <SeloDeVariacao
            variacao={compararPeriodos(atual.cancelados, anterior.cancelados)}
            absoluta
            menosEMelhor
            rotuloAnterior={rotuloAnterior}
          />
        }
        barras={porDia.map((d) => d.cancelados)}
        corDasBarras="bg-[#8A3A12]"
        nota={`${pctCancelados.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% dos pedidos`}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------

const ROTULO_DO_TIPO: Record<DeliveryType, string> = {
  DELIVERY: "Entrega",
  PICKUP: "Retirada",
  DINE_IN: "Mesa",
};

// Do mais vendido para baixo, a barra clareia junto com o valor.
const CORES_DO_RANKING = ["bg-loja-brasa", "bg-brand", "bg-[#E3804E]", "bg-[#F2A67F]", "bg-[#F6DCC6]"];

function MaisVendidos({ itens }: { itens: DadosDoPainel["maisVendidos"] }) {
  const maior = itens[0]?.quantidade ?? 0;
  return (
    <section aria-labelledby="titulo-vendidos" className={`${secao} flex flex-col gap-3`}>
      <h2 id="titulo-vendidos" className={tituloDeSecao}>
        Mais vendidos
      </h2>
      {itens.length === 0 ? (
        <p className="text-[13px] text-loja-tinta-2">Nenhum item vendido neste período.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {itens.map((item, i) => (
            <li key={item.menuItemId} className="flex items-center gap-3">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt=""
                  width={44}
                  height={44}
                  unoptimized={!imagemOtimizavel(item.imageUrl)}
                  className="h-11 w-11 shrink-0 rounded-xl bg-loja-pessego object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="manchete flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-loja-pessego text-[18px] text-[#6A3A1E]"
                >
                  {item.nome.charAt(0)}
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
                <div className="flex justify-between gap-2 text-[13px]">
                  <span className="truncate font-bold">{item.nome}</span>
                  <span className="shrink-0 font-extrabold text-loja-preco">{moedaSemCentavos(item.receita)}</span>
                </div>
                <div aria-hidden="true" className="h-1.5 rounded-full bg-loja-creme">
                  <span
                    className={cn("block h-1.5 rounded-full", CORES_DO_RANKING[i] ?? CORES_DO_RANKING[4])}
                    style={{ width: `${maior > 0 ? Math.round((item.quantidade / maior) * 100) : 0}%` }}
                  />
                </div>
                <span className="text-[11px] text-loja-tinta-2">
                  {item.quantidade} {item.quantidade === 1 ? "vendido" : "vendidos"}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function CartaoDeClientes({ dados, inicio }: { dados: DadosDoPainel; inicio: Date }) {
  const c = classificarClientes(dados.clientes, inicio);
  const total = c.novos + c.voltaram;
  const pedidosComConta = c.pedidosDeNovos + c.pedidosDeQuemVoltou;
  const pctVoltaram = total > 0 ? Math.round((c.voltaram / total) * 100) : 0;
  const pctPedidosDeQuemVoltou =
    pedidosComConta > 0 ? Math.round((c.pedidosDeQuemVoltou / pedidosComConta) * 100) : 0;
  const semConta = dados.atual.semConta;

  return (
    <section aria-labelledby="titulo-clientes" className={`${secao} flex flex-col gap-3`}>
      <h2 id="titulo-clientes" className={tituloDeSecao}>
        Clientes
      </h2>
      {total === 0 ? (
        <p className="text-[13px] leading-relaxed text-loja-tinta-2">Nenhum cliente com conta pediu neste período.</p>
      ) : (
        <>
          <div className="flex gap-[22px]">
            <div className="flex flex-col">
              <span className="manchete text-[34px] leading-none text-forest-dark">{c.voltaram}</span>
              <span className="text-[12px] text-loja-tinta-2">voltaram</span>
            </div>
            <div className="flex flex-col">
              <span className="manchete text-[34px] leading-none text-loja-preco">{c.novos}</span>
              <span className="text-[12px] text-loja-tinta-2">primeira vez</span>
            </div>
          </div>
          <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-md bg-loja-creme">
            <span className="bg-forest-dark" style={{ width: `${pctVoltaram}%` }} />
            <span className="bg-brand" style={{ width: `${100 - pctVoltaram}%` }} />
          </div>
          <p className="text-[12px] leading-relaxed text-[#4E4038]">
            {pctPedidosDeQuemVoltou}% dos pedidos de clientes com conta vêm de quem já tinha comprado.
          </p>
        </>
      )}
      {semConta > 0 && (
        <p className="text-[11.5px] leading-relaxed text-loja-tinta-2">
          {semConta} {semConta === 1 ? "pedido sem conta (mesa ou sem login) fica" : "pedidos sem conta (mesa ou sem login) ficam"} fora desta conta.
        </p>
      )}
    </section>
  );
}

function CartaoDeCupons({ dados }: { dados: DadosDoPainel }) {
  const { cupons, cuponsTotal } = dados;
  return (
    <section aria-labelledby="titulo-cupons" className={`${secao} flex flex-col gap-3`}>
      <h2 id="titulo-cupons" className={tituloDeSecao}>
        Cupons
      </h2>
      {cupons.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-loja-tinta-2">
          Nenhum cupom usado neste período.{" "}
          <Link href="/adm/banner-cupons" className="font-bold text-loja-preco underline underline-offset-2">
            Criar um cupom
          </Link>
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {cupons.map((c, i) => (
              <li
                key={c.codigo}
                className={cn(
                  "flex items-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed px-3 py-2.5",
                  i === 0 ? "border-[#9CBBA9]" : "border-[#E2D2BF]"
                )}
              >
                <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-forest-dark">{c.codigo}</span>
                <span className="shrink-0 text-[12px] text-[#4E4038]">
                  {c.usos} {c.usos === 1 ? "uso" : "usos"}
                </span>
                <span className="shrink-0 text-[13px] font-extrabold text-loja-preco">
                  <span className="sr-only">desconto de </span>− {formatCurrency(c.desconto)}
                </span>
              </li>
            ))}
          </ul>
          <span className="text-[12px] leading-relaxed text-loja-tinta-2">
            {moedaSemCentavos(cuponsTotal.desconto)} de desconto em {cuponsTotal.usos}{" "}
            {cuponsTotal.usos === 1 ? "pedido" : "pedidos"}, que somaram {moedaSemCentavos(cuponsTotal.pedidos)}.
          </span>
        </>
      )}
    </section>
  );
}

function CartaoDeEntregas({ dados }: { dados: DadosDoPainel }) {
  return (
    <section aria-labelledby="titulo-entregas" className={`${secao} flex flex-col gap-3`}>
      <h2 id="titulo-entregas" className={tituloDeSecao}>
        Entregas
      </h2>
      {dados.motoboys.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-loja-tinta-2">Nenhuma entrega de motoboy neste período.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {dados.motoboys.map((m) => (
            <li key={m.id} className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-loja-folha text-[13px] font-extrabold text-forest-dark"
              >
                {m.nome.trim().charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{m.nome}</span>
              <span className="shrink-0 text-[12px] text-[#4E4038]">
                {m.entregas} {m.entregas === 1 ? "entrega" : "entregas"}
              </span>
              <span className="w-14 shrink-0 text-right text-[12px] font-extrabold text-forest-dark">
                {m.minutosNaRua === null ? (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">sem tempo medido</span>
                  </>
                ) : (
                  `${m.minutosNaRua} min`
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <span className="text-[12px] leading-relaxed text-loja-tinta-2">
        Tempo na rua: da saída do motoboy (o primeiro sinal do GPS) até entregue.
      </span>
    </section>
  );
}

// ---------------------------------------------------------------------------

const ROTULO_DO_STATUS: Record<OrderStatus, string> = {
  PENDING: "Novo",
  CONFIRMED: "Aceito",
  IN_PREPARATION: "Em preparo",
  READY: "Pronto",
  OUT_FOR_DELIVERY: "A caminho",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
};

const ROTULO_DA_FORMA: Record<PaymentMethod, string> = {
  PIX: "Pix",
  CREDIT_CARD: "Cartão",
  CASH: "Dinheiro",
};

function pagamentoDoPedido(p: PedidoRecente): string {
  const forma = ROTULO_DA_FORMA[p.paymentMethod];
  // Dinheiro se acerta na entrega ou no balcão: "pendente" ali seria alarme
  // falso em todo pedido.
  if (p.paymentMethod === "CASH") return forma;
  if (p.paymentStatus === "PAID") return `${forma} pago`;
  if (p.paymentStatus === "REFUNDED") return `${forma} estornado`;
  return `${forma} pendente`;
}

const hora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});

function UltimosPedidos({ pedidos }: { pedidos: PedidoRecente[] }) {
  return (
    <section aria-labelledby="titulo-ultimos" className={secao}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="titulo-ultimos" className={tituloDeSecao}>
          Últimos pedidos
        </h2>
        <Link
          href="/adm/orders"
          className="-my-3 inline-flex min-h-11 items-center text-[12.5px] font-bold text-loja-preco hover:text-forest-dark"
        >
          Abrir pedidos
        </Link>
      </div>
      {pedidos.length === 0 ? (
        <p className="mt-3 text-[13px] text-loja-tinta-2">Ainda não chegou nenhum pedido.</p>
      ) : (
        <div className="mt-2.5 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left">
                {["Pedido", "Hora", "Cliente", "Como", "Pagamento", "Status"].map((t) => (
                  <th key={t} scope="col" className={cn(rotulo, "px-2 py-2.5")}>
                    {t}
                  </th>
                ))}
                <th scope="col" className={cn(rotulo, "px-2 py-2.5 text-right")}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id} className={linhaDeTabela}>
                  <td className="px-2 py-[11px] font-extrabold">{numeroDoPedido(p.id)}</td>
                  <td className="px-2 py-[11px] text-[#4E4038]">{hora.format(p.criadoEm)}</td>
                  <td className="px-2 py-[11px]">
                    {p.deliveryType === "DINE_IN" && p.mesa !== null
                      ? `Mesa ${p.mesa}`
                      : (nomeCurto(p.cliente) ?? "—")}
                  </td>
                  <td className="px-2 py-[11px] text-[#4E4038]">{ROTULO_DO_TIPO[p.deliveryType]}</td>
                  <td className="px-2 py-[11px] text-[#4E4038]">{pagamentoDoPedido(p)}</td>
                  <td className="px-2 py-[11px]">
                    <span className={cn(seloBase, SELO_DO_PEDIDO[p.status])}>{ROTULO_DO_STATUS[p.status]}</span>
                  </td>
                  <td className="px-2 py-[11px] text-right font-extrabold">{formatCurrency(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
