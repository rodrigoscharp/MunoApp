import { unstable_cache } from "next/cache";
import { prismaUnscoped } from "@/lib/prisma";
import { FUSO } from "@/lib/platform-series";
import {
  diaBRT,
  inicioDeDiasAtrasBRT,
  inicioDoDiaBRT,
  inicioDoMesBRT,
} from "@/lib/faturamento";

/**
 * Os gráficos do /adm: receita dos últimos 30 dias, itens mais pedidos e
 * formas de pagamento.
 *
 * Mora aqui, e não em /api/analytics, porque agora são dois consumidores: a
 * página do painel calcula no servidor e entrega pronto ao componente (antes ele
 * montava, buscava a rota e só então desenhava), e a rota continua respondendo
 * a mesma coisa para quem a chamar.
 *
 * Os cards de "hoje" e "mês" NÃO saem daqui. A página já os calcula para
 * mostrar no topo, e recalcular a mesma soma para o gráfico era pagar duas
 * vezes pela mesma resposta.
 *
 * Todas as consultas usam o cliente sem escopo, com `tenantId` explícito em
 * cada uma. Duas razões: `$queryRaw` não passa pela extensão de tenant (ela só
 * intercepta operações de model), e dentro de `unstable_cache` o contexto do
 * AsyncLocalStorage não é garantido — o tenant precisa viajar como argumento,
 * que é também o que entra na chave do cache.
 */

export interface FormasDePagamento {
  CASH: number;
  CREDIT_CARD: number;
  PIX: number;
}

export interface DadosDosGraficos {
  dailySales: { date: string; revenue: number }[];
  topItems: { name: string; quantity: number }[];
  paymentBreakdown: { today: FormasDePagamento; month: FormasDePagamento };
}

type LinhaDeReceita = { dia: string; receita: number };
type LinhaDeItem = { nome: string | null; quantidade: number };

const UM_DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_NA_JANELA = 30;

export async function calcularGraficos(
  tenantId: string,
  agora: Date = new Date()
): Promise<DadosDosGraficos> {
  const inicioDeHoje = inicioDoDiaBRT(agora);
  // 29, não 30: a janela são 30 baldes contando **hoje** como o último. Com 30
  // o intervalo ia de D-30 a D-1 e o gráfico do dono terminava sempre em
  // ontem, com o movimento de hoje fora de barra nenhuma.
  const inicioDaJanela = inicioDeDiasAtrasBRT(agora, DIAS_NA_JANELA - 1);
  const inicioDoMes = inicioDoMesBRT(agora);

  const [receitaPorDia, maisPedidos, pagamentosHoje, pagamentosMes] = await Promise.all([
    // Somado no banco, um valor por dia. Antes vinha uma linha por pedido dos
    // 30 dias para o Node somar duas colunas — o custo crescia com o movimento
    // do restaurante, justamente o cliente que mais abre o painel.
    //
    // O WHERE é FILTRO_DE_RECEITA (src/lib/faturamento.ts) escrito em SQL:
    // entregue ou pago, e nunca cancelado. Precisa continuar igual ao dos
    // cards, senão o gráfico e o card ao lado voltam a discordar.
    // `createdAt` é timestamp sem fuso gravado em UTC, daí o duplo AT TIME
    // ZONE, o mesmo da visão geral do console (src/app/platform/page.tsx).
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
    // Ranking e nome na mesma consulta. Antes era um groupBy seguido de um
    // findMany dos nomes, que só podia sair depois do primeiro: uma ida ao
    // banco a mais, em série, em toda abertura do painel.
    //
    // Item de pedido cancelado não foi vendido: sem o filtro, um pedido grande
    // cancelado empurrava o prato para o topo. A janela é a mesma do gráfico.
    // O LEFT JOIN mantém no ranking o item que já não está no cardápio.
    prismaUnscoped.$queryRaw<LinhaDeItem[]>`
      SELECT
        mi.name AS nome,
        sum(oi.quantity)::int AS quantidade
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      LEFT JOIN "MenuItem" mi ON mi.id = oi."menuItemId"
      WHERE oi."tenantId" = ${tenantId}
        AND o."tenantId" = ${tenantId}
        AND o.status <> 'CANCELLED'
        AND o."createdAt" >= ${inicioDaJanela}
      GROUP BY oi."menuItemId", mi.name
      ORDER BY quantidade DESC
      LIMIT 10
    `,
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

  const topItems = maisPedidos.map((l) => ({
    name: l.nome ?? "Desconhecido",
    quantity: Number(l.quantidade),
  }));

  return {
    dailySales,
    topItems,
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
 * A mesma conta, guardada por 60 segundos por restaurante.
 *
 * O tenantId é argumento, e o `unstable_cache` põe os argumentos na chave: um
 * restaurante nunca lê o cache do outro. Um minuto é o atraso aceitável para um
 * gráfico de 30 dias, e poupa as quatro consultas a cada F5 do dono no painel.
 * O retorno passa por JSON no cache, por isso só há número e texto aqui.
 */
export const graficosEmCache = unstable_cache(
  async (tenantId: string) => calcularGraficos(tenantId),
  ["adm-graficos"],
  { revalidate: 60 }
);
