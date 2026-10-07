import type { NivelEvento } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import { FUSO, chaveDoDia } from "@/lib/platform-series";
import type { DadosDeSaude, LeituraDeSaude } from "./avaliar";
import type { FiltrosDoFeed } from "./filtros";
import { LIMIARES } from "./limiares";
import { classificarOrigem, ORIGEM_DO_CRON } from "./origens";
import { horaEmBrasilia, montarPedidosPorHora, type BarraDePedidos, type LinhaPorHora } from "./pedidos";

/**
 * Tudo que a saúde lê do banco. Cross-tenant por natureza, só para o console
 * da plataforma e para a rota do monitor, por isso prismaUnscoped.
 */

const H = 3_600_000;
const SEMANA = 7 * 24 * H;

/** Nunca lança: banco fora do ar é uma resposta, não uma exceção. */
export async function coletarDadosDeSaude(agora: Date): Promise<DadosDeSaude> {
  const inicio = Date.now();
  try {
    await prismaUnscoped.$queryRaw`select 1`;
  } catch (erro) {
    // Só o nome do erro: a mensagem do Prisma pode ecoar o texto da consulta.
    // reportarErro não serve aqui, ele grava na mesma tabela que acabou de falhar.
    console.error("[saude] o banco não respondeu ao select 1", nomeDoErro(erro));
    return { banco: { ok: false, ms: Date.now() - inicio }, leitura: null };
  }
  const ms = Date.now() - inicio;

  try {
    return { banco: { ok: true, ms }, leitura: await ler(agora) };
  } catch (erro) {
    // O banco respondeu ao select 1 e falhou na leitura: para quem olha, é o
    // mesmo problema. Sem este log, uma coluna que falta ou um SQL errado
    // apareceriam na tela como "o banco não respondeu", sem rastro nenhum.
    console.error("[saude] leitura da saúde falhou", nomeDoErro(erro));
    return { banco: { ok: false, ms }, leitura: null };
  }
}

const nomeDoErro = (erro: unknown) => (erro instanceof Error ? erro.name : "erro");

async function ler(agora: Date): Promise<LeituraDeSaude> {
  const contarPedidos = (fim: Date) =>
    prismaUnscoped.order.count({ where: { createdAt: { gte: new Date(fim.getTime() - H), lt: fim } } });
  const semanas = Array.from({ length: LIMIARES.semanasDeComparacao }, (_, i) => new Date(agora.getTime() - (i + 1) * SEMANA));

  // Dois Promise.all aninhados, e não um só com spread: o tamanho variável
  // de `semanas` faria o TypeScript perder o tipo de cada posição da tupla.
  const [fixos, mesmaHoraAntes] = await Promise.all([
    Promise.all([
      prismaUnscoped.eventoSistema.findMany({
        where: { criadoEm: { gte: new Date(agora.getTime() - LIMIARES.janelaDeEventosH * H) } },
        select: { origem: true, nivel: true, criadoEm: true },
        orderBy: { criadoEm: "desc" },
      }),
      prismaUnscoped.eventoSistema.findFirst({
        where: { origem: ORIGEM_DO_CRON, nivel: { in: ["OK", "AVISO"] } },
        select: { origem: true, nivel: true, criadoEm: true },
        orderBy: { criadoEm: "desc" },
      }),
      prismaUnscoped.eventoSistema.findFirst({ select: { criadoEm: true }, orderBy: { criadoEm: "asc" } }),
      prismaUnscoped.inscricao.count({ where: { status: "PAGA" } }),
      // updatedAt é, na prática, quando ela virou PAGA. O provisionamento pode
      // movê-lo uma vez, segundos depois, ao gravar o tenantId antes de falhar.
      prismaUnscoped.inscricao.findFirst({
        where: { status: "PAGA" },
        select: { updatedAt: true },
        orderBy: { updatedAt: "asc" },
      }),
      prismaUnscoped.order.findFirst({ select: { createdAt: true }, orderBy: { createdAt: "desc" } }),
      contarPedidos(agora),
    ]),
    Promise.all(semanas.map(contarPedidos)),
  ]);
  const [eventos, ultimoCron, primeiro, pagas, maisAntiga, ultimoPedido, naUltimaHora] = fixos;

  return {
    eventos,
    ultimoCron,
    primeiroEvento: primeiro?.criadoEm ?? null,
    inscricoesPagas: { total: pagas, maisAntiga: maisAntiga?.updatedAt ?? null },
    pedidos: { naUltimaHora, mesmaHoraAntes, ultimoPedido: ultimoPedido?.createdAt ?? null },
  };
}

/** Hoje, hora a hora em São Paulo, contra a média dos mesmos dias da semana anteriores. */
export async function coletarPedidosPorHora(agora: Date): Promise<BarraDePedidos[]> {
  const hoje = chaveDoDia(agora);
  const anteriores = Array.from({ length: LIMIARES.semanasDeComparacao }, (_, i) =>
    chaveDoDia(new Date(agora.getTime() - (i + 1) * SEMANA))
  );
  // Meia-noite de São Paulo do dia mais antigo. O Brasil não tem horário de
  // verão desde 2019, então -03:00 vale o ano inteiro.
  const desde = new Date(`${anteriores.at(-1)}T00:00:00-03:00`);

  // "createdAt" é timestamp sem fuso guardando UTC: o primeiro AT TIME ZONE
  // diz isso ao Postgres, o segundo converte para o relógio de São Paulo.
  const linhas = await prismaUnscoped.$queryRaw<LinhaPorHora[]>`
    SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${FUSO}, 'YYYY-MM-DD') AS dia,
           EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${FUSO})::int AS hora,
           COUNT(*)::int AS n
    FROM "Order"
    WHERE "createdAt" >= ${desde} AND "createdAt" < ${agora}
    GROUP BY 1, 2`;

  return montarPedidosPorHora(linhas, hoje, anteriores, horaEmBrasilia(agora));
}

export type LinhaDoFeed = {
  id: string;
  origem: string;
  nivel: NivelEvento;
  mensagem: string;
  tenantId: string | null;
  restaurante: string | null;
  criadoEm: Date;
};

export async function listarEventos(filtros: FiltrosDoFeed): Promise<LinhaDoFeed[]> {
  const linhas = await prismaUnscoped.eventoSistema.findMany({
    where: {
      ...(filtros.todos ? {} : { nivel: { in: ["AVISO", "ERRO"] } }),
      ...(filtros.tenantId ? { tenantId: filtros.tenantId } : {}),
    },
    select: { id: true, origem: true, nivel: true, mensagem: true, tenantId: true, criadoEm: true },
    orderBy: { criadoEm: "desc" },
    take: LIMIARES.eventosLidosNoFeed,
  });

  // A peça é decidida por prefixo em classificarOrigem; filtrar aqui, e não no
  // where, mantém uma regra só.
  const daPeca = filtros.peca
    ? linhas.filter((l) => (classificarOrigem(l.origem) ?? "outros") === filtros.peca)
    : linhas;
  const recorte = daPeca.slice(0, LIMIARES.eventosNoFeed);

  const ids = [...new Set(recorte.map((l) => l.tenantId).filter((id): id is string => !!id))];
  const tenants = ids.length
    ? await prismaUnscoped.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })
    : [];
  const nomes = new Map(tenants.map((t) => [t.id, t.nome]));

  return recorte.map((l) => ({
    ...l,
    restaurante: l.tenantId ? (nomes.get(l.tenantId) ?? "restaurante removido") : null,
  }));
}
