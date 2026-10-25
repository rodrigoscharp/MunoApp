import { unstable_cache } from "next/cache";
import type { DeliveryType, OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import { FUSO } from "@/lib/platform-series";
import {
  diaBRT,
  inicioDeDiasAtrasBRT,
  inicioDoDiaBRT,
  inicioDoMesBRT,
} from "@/lib/faturamento";
import { intervaloDoPeriodo, type Periodo } from "@/lib/painel/periodo";

/**
 * Os números do /adm: o dashboard do painel (por período) e os gráficos que
 * /api/analytics continua respondendo.
 *
 * Todas as consultas usam o cliente sem escopo, com `tenantId` explícito em
 * cada uma. Duas razões: `$queryRaw` não passa pela extensão de tenant (ela só
 * intercepta operações de model), e dentro de `unstable_cache` o contexto do
 * AsyncLocalStorage não é garantido — o tenant precisa viajar como argumento,
 * que é também o que entra na chave do cache.
 *
 * Receita, em todo lugar daqui, é FILTRO_DE_RECEITA (src/lib/faturamento.ts)
 * escrito em SQL: entregue ou pago, e nunca cancelado. `createdAt` é timestamp
 * sem fuso gravado em UTC, daí o duplo AT TIME ZONE quando a conta é por dia
 * ou por hora de Brasília, o mesmo da visão geral do console.
 *
 * O cache passa por JSON: só sai daqui número, texto e nulo. Data vira ISO.
 */

const UM_DIA_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Mais vendidos: o card do dashboard e o ranking de /api/analytics.
// ---------------------------------------------------------------------------

export interface ItemVendido {
  menuItemId: string;
  /** O nome atual do item; "Item removido" quando ele saiu do cardápio. */
  nome: string;
  imageUrl: string | null;
  quantidade: number;
  receita: number;
}

type LinhaDeItem = {
  menuItemId: string;
  nome: string | null;
  imageUrl: string | null;
  quantidade: number;
  receita: number;
};

/**
 * Ranking e nome na mesma consulta: antes era um groupBy seguido de um
 * findMany dos nomes, uma ida ao banco a mais, em série.
 *
 * Item de pedido cancelado não foi vendido: sem o filtro, um pedido grande
 * cancelado empurrava o prato para o topo. O LEFT JOIN mantém no ranking o
 * item que já não está no cardápio. A receita do item é o preço gravado no
 * pedido (`unitPrice`), não o do cardápio de hoje.
 */
export async function consultarMaisVendidos(
  tenantId: string,
  inicio: Date,
  fim: Date,
  limite: number
): Promise<ItemVendido[]> {
  const linhas = await prismaUnscoped.$queryRaw<LinhaDeItem[]>`
    SELECT
      oi."menuItemId" AS "menuItemId",
      mi.name AS nome,
      mi."imageUrl" AS "imageUrl",
      sum(oi.quantity)::int AS quantidade,
      coalesce(sum(oi.quantity * oi."unitPrice"), 0)::float8 AS receita
    FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId"
    LEFT JOIN "MenuItem" mi ON mi.id = oi."menuItemId"
    WHERE oi."tenantId" = ${tenantId}
      AND o."tenantId" = ${tenantId}
      AND o.status <> 'CANCELLED'
      AND o."createdAt" >= ${inicio}
      AND o."createdAt" < ${fim}
    GROUP BY oi."menuItemId", mi.name, mi."imageUrl"
    ORDER BY quantidade DESC
    LIMIT ${limite}
  `;
  return linhas.map((l) => ({
    menuItemId: l.menuItemId,
    nome: l.nome ?? "Item removido",
    imageUrl: l.imageUrl ?? null,
    quantidade: Number(l.quantidade),
    receita: Number(l.receita),
  }));
}

// ---------------------------------------------------------------------------
// /api/analytics: receita dos últimos 30 dias, ranking e formas de pagamento.
// ---------------------------------------------------------------------------

export interface FormasDePagamento {
  CASH: number;
  CREDIT_CARD: number;
  PIX: number;
}

export interface DadosDosGraficos {
  dailySales: { date: string; revenue: number }[];
  topItems: { menuItemId: string; name: string; quantity: number; imageUrl: string | null }[];
  paymentBreakdown: { today: FormasDePagamento; month: FormasDePagamento };
}

type LinhaDeReceita = { dia: string; receita: number };

const DIAS_NA_JANELA = 30;

export async function calcularGraficos(
  tenantId: string,
  agora: Date = new Date()
): Promise<DadosDosGraficos> {
  const inicioDeHoje = inicioDoDiaBRT(agora);
  // 29, não 30: a janela são 30 baldes contando **hoje** como o último.
  const inicioDaJanela = inicioDeDiasAtrasBRT(agora, DIAS_NA_JANELA - 1);
  const inicioDoMes = inicioDoMesBRT(agora);

  const [receitaPorDia, maisPedidos, pagamentosHoje, pagamentosMes] = await Promise.all([
    prismaUnscoped.$queryRaw<LinhaDeReceita[]>`
      SELECT
        to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${FUSO}, 'YYYY-MM-DD') AS dia,
        coalesce(sum(total), 0)::float8 AS receita
      FROM "Order"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${inicioDaJanela}
        AND (status = 'DELIVERED' OR "paymentStatus" = 'PAID')
        AND status <> 'CANCELLED'
      GROUP BY 1
    `,
    // A mesma janela do gráfico, aberta até agora.
    consultarMaisVendidos(tenantId, inicioDaJanela, new Date(agora.getTime() + 1), 10),
    prismaUnscoped.payment.groupBy({
      by: ["method"],
      where: { tenantId, createdAt: { gte: inicioDeHoje } },
      _sum: { amount: true },
    }),
    prismaUnscoped.payment.groupBy({
      by: ["method"],
      where: { tenantId, createdAt: { gte: inicioDoMes } },
      _sum: { amount: true },
    }),
  ]);

  // As chaves são dias do calendário de Brasília nas duas pontas: os baldes
  // aqui e o `to_char` da consulta. O dia que o banco não devolve é dia sem
  // venda, e o dia que ele devolve fora da janela não cria balde novo.
  const porDia = new Map(receitaPorDia.map((l) => [l.dia, Number(l.receita)]));
  const dailySales = Array.from({ length: DIAS_NA_JANELA }, (_, i) => {
    const date = diaBRT(new Date(inicioDaJanela.getTime() + i * UM_DIA_MS));
    return { date, revenue: porDia.get(date) ?? 0 };
  });

  return {
    dailySales,
    topItems: maisPedidos.map((i) => ({
      menuItemId: i.menuItemId,
      name: i.nome,
      quantity: i.quantidade,
      imageUrl: i.imageUrl,
    })),
    paymentBreakdown: {
      today: porForma(pagamentosHoje),
      month: porForma(pagamentosMes),
    },
  };
}

function porForma(rows: { method: string; _sum: { amount: unknown } }[]): FormasDePagamento {
  const de = (m: string) => Number(rows.find((r) => r.method === m)?._sum.amount ?? 0);
  return { CASH: de("CASH"), CREDIT_CARD: de("CREDIT_CARD"), PIX: de("PIX") };
}

/**
 * A mesma conta, guardada por 60 segundos por restaurante. O tenantId é
 * argumento, e o `unstable_cache` põe os argumentos na chave: um restaurante
 * nunca lê o cache do outro.
 */
export const graficosEmCache = unstable_cache(
  async (tenantId: string) => calcularGraficos(tenantId),
  ["adm-graficos"],
  { revalidate: 60 }
);

// ---------------------------------------------------------------------------
// O dashboard do /adm, por período.
// ---------------------------------------------------------------------------

export interface ResumoDoPeriodo {
  /** Soma dos pedidos que viraram dinheiro (FILTRO_DE_RECEITA). */
  receita: number;
  /** Quantos pedidos entram na receita: é o divisor do ticket médio. */
  faturados: number;
  /** Todo pedido que chegou e não foi cancelado, pago ou não. */
  pedidos: number;
  cancelados: number;
  /** Pedidos não cancelados sem conta de cliente (mesa, checkout sem login). */
  semConta: number;
}

export interface DiaDoPainel {
  dia: string;
  receita: number;
  faturados: number;
  pedidos: number;
  cancelados: number;
}

export interface DadosDoPainel {
  periodo: Periodo;
  atual: ResumoDoPeriodo;
  anterior: ResumoDoPeriodo;
  porDia: DiaDoPainel[];
  porTipo: { tipo: DeliveryType; pedidos: number; faturados: number; receita: number }[];
  porPagamento: { forma: PaymentMethod; pedidos: number }[];
  maisVendidos: ItemVendido[];
  /** Um por cliente com conta que pediu no período. */
  clientes: { primeiroPedido: string; pedidos: number }[];
  cupons: { codigo: string; usos: number; desconto: number; pedidos: number }[];
  cuponsTotal: { usos: number; desconto: number; pedidos: number };
  motoboys: {
    id: string;
    nome: string;
    entregas: number;
    /** Média do tempo na rua, só das entregas com medida confiável. */
    minutosNaRua: number | null;
  }[];
}

type LinhaDoResumo = {
  [K in `${"a" | "b"}_${keyof ResumoDoPeriodo}`]: number;
};

type LinhaDeCupom = {
  codigo: string;
  usos: number;
  desconto: number;
  pedidos: number;
  usos_total: number;
  desconto_total: number;
  pedidos_total: number;
};

type LinhaDeMotoboy = {
  id: string;
  nome: string;
  entregas: number;
  segundos: number | null;
};

/**
 * Tudo o que o dashboard mostra do período, em consultas paralelas.
 *
 * O resumo do período atual e o do anterior saem de UMA consulta, com
 * `FILTER`: as duas janelas sobre o mesmo índice [tenantId, createdAt], em vez
 * de duas idas ao banco que precisariam concordar sobre a mesma regra.
 */
export async function calcularPainel(
  tenantId: string,
  periodo: Periodo,
  agora: Date = new Date()
): Promise<DadosDoPainel> {
  const { atual, anterior, diasDaSerie } = intervaloDoPeriodo(periodo, agora);
  const ini = atual.inicio;
  const fim = atual.fim;
  const aIni = anterior.inicio;
  const aFim = anterior.fim;
  // A série pode começar antes do período ("hoje" desenha a semana).
  // Meia-noite de Brasília do primeiro dia da série é 03:00 UTC.
  const inicioDaSerie = new Date(
    Math.min(ini.getTime(), new Date(`${diasDaSerie[0]}T03:00:00.000Z`).getTime())
  );
  // O fim de cada janela é exclusivo; +1ms inclui o pedido gravado neste
  // exato instante.
  const fimAberto = new Date(fim.getTime() + 1);

  const [resumo, porDia, porTipo, porPagamento, maisVendidos, clientes, cupons, motoboys] =
    await Promise.all([
      prismaUnscoped.$queryRaw<LinhaDoResumo[]>`
        SELECT
          coalesce(sum(total) FILTER (WHERE "createdAt" >= ${ini} AND "createdAt" < ${fimAberto} AND (status = 'DELIVERED' OR "paymentStatus" = 'PAID') AND status <> 'CANCELLED'), 0)::float8 AS a_receita,
          count(*) FILTER (WHERE "createdAt" >= ${ini} AND "createdAt" < ${fimAberto} AND (status = 'DELIVERED' OR "paymentStatus" = 'PAID') AND status <> 'CANCELLED')::int AS a_faturados,
          count(*) FILTER (WHERE "createdAt" >= ${ini} AND "createdAt" < ${fimAberto} AND status <> 'CANCELLED')::int AS a_pedidos,
          count(*) FILTER (WHERE "createdAt" >= ${ini} AND "createdAt" < ${fimAberto} AND status = 'CANCELLED')::int AS a_cancelados,
          count(*) FILTER (WHERE "createdAt" >= ${ini} AND "createdAt" < ${fimAberto} AND status <> 'CANCELLED' AND "userId" IS NULL)::int AS "a_semConta",
          coalesce(sum(total) FILTER (WHERE "createdAt" >= ${aIni} AND "createdAt" < ${aFim} AND (status = 'DELIVERED' OR "paymentStatus" = 'PAID') AND status <> 'CANCELLED'), 0)::float8 AS b_receita,
          count(*) FILTER (WHERE "createdAt" >= ${aIni} AND "createdAt" < ${aFim} AND (status = 'DELIVERED' OR "paymentStatus" = 'PAID') AND status <> 'CANCELLED')::int AS b_faturados,
          count(*) FILTER (WHERE "createdAt" >= ${aIni} AND "createdAt" < ${aFim} AND status <> 'CANCELLED')::int AS b_pedidos,
          count(*) FILTER (WHERE "createdAt" >= ${aIni} AND "createdAt" < ${aFim} AND status = 'CANCELLED')::int AS b_cancelados,
          count(*) FILTER (WHERE "createdAt" >= ${aIni} AND "createdAt" < ${aFim} AND status <> 'CANCELLED' AND "userId" IS NULL)::int AS "b_semConta"
        FROM "Order"
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" >= ${aIni}
          AND "createdAt" < ${fimAberto}
      `,
      prismaUnscoped.$queryRaw<DiaDoPainel[]>`
        SELECT
          to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${FUSO}, 'YYYY-MM-DD') AS dia,
          coalesce(sum(total) FILTER (WHERE (status = 'DELIVERED' OR "paymentStatus" = 'PAID') AND status <> 'CANCELLED'), 0)::float8 AS receita,
          count(*) FILTER (WHERE (status = 'DELIVERED' OR "paymentStatus" = 'PAID') AND status <> 'CANCELLED')::int AS faturados,
          count(*) FILTER (WHERE status <> 'CANCELLED')::int AS pedidos,
          count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelados
        FROM "Order"
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" >= ${inicioDaSerie}
          AND "createdAt" < ${fimAberto}
        GROUP BY 1
      `,
      prismaUnscoped.$queryRaw<DadosDoPainel["porTipo"]>`
        SELECT
          "deliveryType" AS tipo,
          count(*)::int AS pedidos,
          count(*) FILTER (WHERE status = 'DELIVERED' OR "paymentStatus" = 'PAID')::int AS faturados,
          coalesce(sum(total) FILTER (WHERE status = 'DELIVERED' OR "paymentStatus" = 'PAID'), 0)::float8 AS receita
        FROM "Order"
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" >= ${ini}
          AND "createdAt" < ${fimAberto}
          AND status <> 'CANCELLED'
        GROUP BY 1
      `,
      prismaUnscoped.$queryRaw<DadosDoPainel["porPagamento"]>`
        SELECT "paymentMethod" AS forma, count(*)::int AS pedidos
        FROM "Order"
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" >= ${ini}
          AND "createdAt" < ${fimAberto}
          AND status <> 'CANCELLED'
        GROUP BY 1
      `,
      consultarMaisVendidos(tenantId, ini, fimAberto, 5),
      // Um por cliente que pediu no período, com o primeiro pedido dele na
      // loja. Quem tem o primeiro pedido dentro do período é cliente novo
      // (classificarClientes). O índice [tenantId, userId, createdAt] atende
      // as duas metades.
      prismaUnscoped.$queryRaw<{ primeiro: Date; pedidos: number }[]>`
        WITH no_periodo AS (
          SELECT "userId", count(*)::int AS pedidos
          FROM "Order"
          WHERE "tenantId" = ${tenantId}
            AND "createdAt" >= ${ini}
            AND "createdAt" < ${fimAberto}
            AND status <> 'CANCELLED'
            AND "userId" IS NOT NULL
          GROUP BY 1
        )
        SELECT
          np.pedidos,
          (
            SELECT min(o."createdAt")
            FROM "Order" o
            WHERE o."tenantId" = ${tenantId}
              AND o."userId" = np."userId"
              AND o.status <> 'CANCELLED'
          ) AS primeiro
        FROM no_periodo np
      `,
      // A janela soma todos os cupons antes do LIMIT: o total do rodapé conta
      // também os que não couberam na lista.
      prismaUnscoped.$queryRaw<LinhaDeCupom[]>`
        SELECT
          "couponCode" AS codigo,
          count(*)::int AS usos,
          coalesce(sum(discount), 0)::float8 AS desconto,
          coalesce(sum(total), 0)::float8 AS pedidos,
          (sum(count(*)) OVER ())::int AS usos_total,
          (sum(sum(discount)) OVER ())::float8 AS desconto_total,
          (sum(sum(total)) OVER ())::float8 AS pedidos_total
        FROM "Order"
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" >= ${ini}
          AND "createdAt" < ${fimAberto}
          AND status <> 'CANCELLED'
          AND "couponCode" IS NOT NULL
        GROUP BY 1
        ORDER BY usos DESC, desconto DESC
        LIMIT 4
      `,
      // Tempo na rua: do primeiro sinal de GPS do motoboy (DeliveryTracking
      // .startedAt, gravado quando ele sai) até a última escrita no pedido
      // entregue. Não há coluna "entregue em": o `updatedAt` do pedido é a
      // hora do DELIVERED enquanto ninguém mexer nele depois. Por isso só
      // entram na média as medidas entre 1 minuto e 3 horas: um pedido
      // editado no dia seguinte, ou um motoboy que nunca ligou o GPS, não
      // vira um "tempo médio" de 14 horas. A contagem de entregas inclui
      // todas.
      prismaUnscoped.$queryRaw<LinhaDeMotoboy[]>`
        SELECT
          o."motoboyId" AS id,
          u.name AS nome,
          count(*)::int AS entregas,
          (avg(extract(epoch FROM (o."updatedAt" - dt."startedAt")))
            FILTER (WHERE o."updatedAt" - dt."startedAt" BETWEEN interval '1 minute' AND interval '3 hours'))::float8 AS segundos
        FROM "Order" o
        JOIN "User" u ON u.id = o."motoboyId" AND u."tenantId" = ${tenantId}
        LEFT JOIN "DeliveryTracking" dt ON dt."orderId" = o.id AND dt."tenantId" = ${tenantId}
        WHERE o."tenantId" = ${tenantId}
          AND o."createdAt" >= ${ini}
          AND o."createdAt" < ${fimAberto}
          AND o.status = 'DELIVERED'
          AND o."motoboyId" IS NOT NULL
        GROUP BY 1, 2
        ORDER BY entregas DESC
        LIMIT 5
      `,
    ]);

  const r = resumo[0];
  const lado = (p: "a" | "b"): ResumoDoPeriodo => ({
    receita: Number(r?.[`${p}_receita`] ?? 0),
    faturados: Number(r?.[`${p}_faturados`] ?? 0),
    pedidos: Number(r?.[`${p}_pedidos`] ?? 0),
    cancelados: Number(r?.[`${p}_cancelados`] ?? 0),
    semConta: Number(r?.[`${p}_semConta`] ?? 0),
  });

  // Os baldes são os dias da série; dia sem pedido é zero, e dia que o banco
  // devolve fora dela não cria barra nova.
  const doBanco = new Map(porDia.map((d) => [d.dia, d]));
  const serie = diasDaSerie.map((dia) => {
    const d = doBanco.get(dia);
    return {
      dia,
      receita: Number(d?.receita ?? 0),
      faturados: Number(d?.faturados ?? 0),
      pedidos: Number(d?.pedidos ?? 0),
      cancelados: Number(d?.cancelados ?? 0),
    };
  });

  const c0 = cupons[0];
  return {
    periodo,
    atual: lado("a"),
    anterior: lado("b"),
    porDia: serie,
    porTipo: porTipo.map((t) => ({
      tipo: t.tipo,
      pedidos: Number(t.pedidos),
      faturados: Number(t.faturados),
      receita: Number(t.receita),
    })),
    porPagamento: porPagamento.map((p) => ({ forma: p.forma, pedidos: Number(p.pedidos) })),
    maisVendidos,
    clientes: clientes
      .filter((c) => c.primeiro)
      .map((c) => ({ primeiroPedido: new Date(c.primeiro).toISOString(), pedidos: Number(c.pedidos) })),
    cupons: cupons.map((c) => ({
      codigo: c.codigo,
      usos: Number(c.usos),
      desconto: Number(c.desconto),
      pedidos: Number(c.pedidos),
    })),
    cuponsTotal: {
      usos: Number(c0?.usos_total ?? 0),
      desconto: Number(c0?.desconto_total ?? 0),
      pedidos: Number(c0?.pedidos_total ?? 0),
    },
    motoboys: motoboys.map((m) => ({
      id: m.id,
      nome: m.nome,
      entregas: Number(m.entregas),
      minutosNaRua: m.segundos == null ? null : Math.round(Number(m.segundos) / 60),
    })),
  };
}

/**
 * Hoje muda a cada pedido: 15 segundos. Os outros períodos andam devagar e
 * ficam um minuto, como os gráficos. Os dois põem tenantId e período na chave.
 */
const painelDeHoje = unstable_cache(
  async (tenantId: string) => calcularPainel(tenantId, "hoje"),
  ["adm-painel-hoje"],
  { revalidate: 15 }
);
const painelDoPeriodo = unstable_cache(
  async (tenantId: string, periodo: Periodo) => calcularPainel(tenantId, periodo),
  ["adm-painel"],
  { revalidate: 60 }
);

export function painelEmCache(tenantId: string, periodo: Periodo): Promise<DadosDoPainel> {
  return periodo === "hoje" ? painelDeHoje(tenantId) : painelDoPeriodo(tenantId, periodo);
}

// ---------------------------------------------------------------------------
// Horário de pico: dia da semana por hora, nos últimos 30 dias.
// ---------------------------------------------------------------------------

export type BaldeDeHorario = { diaDaSemana: number; hora: number; pedidos: number };

/**
 * Fixo em 30 dias, independente do período da tela: uma semana só tem um
 * sábado, e um mapa de calor de um sábado é anedota. Pedido cancelado fica
 * de fora: o pico é de trabalho, e cancelado ainda é trabalho na maioria das
 * vezes, mas um Pix nunca pago que caduca não é.
 */
export async function calcularHorarioDePico(
  tenantId: string,
  agora: Date = new Date()
): Promise<BaldeDeHorario[]> {
  const inicio = inicioDeDiasAtrasBRT(agora, 29);
  const linhas = await prismaUnscoped.$queryRaw<BaldeDeHorario[]>`
    SELECT
      extract(dow FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${FUSO})::int AS "diaDaSemana",
      extract(hour FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${FUSO})::int AS hora,
      count(*)::int AS pedidos
    FROM "Order"
    WHERE "tenantId" = ${tenantId}
      AND "createdAt" >= ${inicio}
      AND status <> 'CANCELLED'
    GROUP BY 1, 2
  `;
  return linhas.map((l) => ({
    diaDaSemana: Number(l.diaDaSemana),
    hora: Number(l.hora),
    pedidos: Number(l.pedidos),
  }));
}

/** Trinta dias não mudam em cinco minutos. */
export const horarioDePicoEmCache = unstable_cache(
  async (tenantId: string) => calcularHorarioDePico(tenantId),
  ["adm-horario-de-pico"],
  { revalidate: 300 }
);

// ---------------------------------------------------------------------------
// Agora: o que está na casa. Sem cache, ou o "ao vivo" mentiria.
// ---------------------------------------------------------------------------

/** Os status de quem ainda não terminou: na fila, na cozinha ou na rua. */
export const EM_ANDAMENTO = [
  "PENDING",
  "CONFIRMED",
  "IN_PREPARATION",
  "READY",
  "OUT_FOR_DELIVERY",
] as const satisfies readonly OrderStatus[];

/**
 * A mesma janela do quadro da cozinha (KITCHEN_WINDOW_MS em /api/orders): só
 * conta como "na casa" o pedido das últimas 24 horas. Sem ela, um pedido que
 * ficou PENDING para sempre (cliente que sumiu, teste esquecido) aparecia no
 * "ao vivo" e no número do menu como "esperando há 116 dias", e a cozinha
 * nem o mostrava.
 */
export const JANELA_AO_VIVO_MS = 24 * 60 * 60 * 1000;

function desdeAJanela(): Date {
  return new Date(Date.now() - JANELA_AO_VIVO_MS);
}

/** Os que ainda dependem da cozinha: é a espera destes que o dono vigia. */
const ESPERANDO_A_COZINHA: OrderStatus[] = ["PENDING", "CONFIRMED", "IN_PREPARATION"];

export interface AoVivo {
  porStatus: Record<(typeof EM_ANDAMENTO)[number], number>;
  total: number;
  maisAntigo: { id: string; criadoEm: string } | null;
}

export async function lerAoVivo(tenantId: string): Promise<AoVivo> {
  const [grupos, maisAntigo] = await Promise.all([
    prismaUnscoped.order.groupBy({
      by: ["status"],
      where: { tenantId, status: { in: [...EM_ANDAMENTO] }, createdAt: { gte: desdeAJanela() } },
      _count: { _all: true },
    }),
    prismaUnscoped.order.findFirst({
      where: { tenantId, status: { in: ESPERANDO_A_COZINHA }, createdAt: { gte: desdeAJanela() } },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true },
    }),
  ]);
  const porStatus = Object.fromEntries(EM_ANDAMENTO.map((s) => [s, 0])) as AoVivo["porStatus"];
  for (const g of grupos) {
    if (g.status in porStatus) porStatus[g.status as keyof AoVivo["porStatus"]] = g._count._all;
  }
  return {
    porStatus,
    total: Object.values(porStatus).reduce((a, b) => a + b, 0),
    maisAntigo: maisAntigo ? { id: maisAntigo.id, criadoEm: maisAntigo.createdAt.toISOString() } : null,
  };
}

export interface PedidoRecente {
  id: string;
  criadoEm: Date;
  cliente: string | null;
  mesa: number | null;
  deliveryType: DeliveryType;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  total: number;
}

export async function ultimosPedidos(tenantId: string, quantos = 6): Promise<PedidoRecente[]> {
  const pedidos = await prismaUnscoped.order.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: quantos,
    select: {
      id: true,
      createdAt: true,
      customerName: true,
      deliveryType: true,
      paymentMethod: true,
      paymentStatus: true,
      status: true,
      total: true,
      user: { select: { name: true } },
      table: { select: { number: true } },
    },
  });
  return pedidos.map((p) => ({
    id: p.id,
    criadoEm: p.createdAt,
    // A mesma regra do resto do painel: mesa mostra o nome digitado, entrega
    // e retirada preferem o da conta (getCustomerDisplayName).
    cliente:
      p.deliveryType === "DINE_IN"
        ? p.customerName || p.user?.name || null
        : p.user?.name || p.customerName || null,
    mesa: p.table?.number ?? null,
    deliveryType: p.deliveryType,
    paymentMethod: p.paymentMethod,
    paymentStatus: p.paymentStatus,
    status: p.status,
    total: Number(p.total),
  }));
}

/**
 * O número no item "Pedidos" do menu. O layout roda em toda carga do /adm, e
 * esta contagem ia junto: 30 segundos de cache por restaurante. O dashboard
 * não usa este valor, ele lê `lerAoVivo` sem cache.
 */
export const pedidosEmAndamentoEmCache = unstable_cache(
  async (tenantId: string) =>
    prismaUnscoped.order.count({
      where: { tenantId, status: { in: [...EM_ANDAMENTO] }, createdAt: { gte: desdeAJanela() } },
    }),
  ["adm-pedidos-em-andamento"],
  { revalidate: 30 }
);
