/**
 * Os gráficos do /adm.
 *
 * Tudo aqui é fuso de Brasília e a mesma definição de receita dos cards
 * (FILTRO_DE_RECEITA), agora escrita em SQL. Os testes leem o texto da consulta
 * porque é ele que decide o que entra: o `$queryRaw` não passa pela extensão de
 * tenant, então um `tenantId` esquecido ali devolveria o faturamento de todos
 * os restaurantes sem o banco reclamar.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const queryRaw = vi.fn();
const paymentGroupBy = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
    payment: { groupBy: (...a: unknown[]) => paymentGroupBy(...a) },
  },
}));

import { calcularGraficos } from "./analytics";

const TENANT = "restaurante-a";
// 2026-08-29 09:00 em Brasília.
const AGORA = new Date("2026-08-29T12:00:00.000Z");

type Chamada = { sql: string; valores: unknown[] };

function chamadas(): Chamada[] {
  return queryRaw.mock.calls.map(([partes, ...valores]) => ({
    sql: (partes as TemplateStringsArray).join("?"),
    valores,
  }));
}
const daReceita = () => chamadas().find((c) => c.sql.includes("to_char"))!;
const doRanking = () => chamadas().find((c) => c.sql.includes('"OrderItem"'))!;

let receita: { dia: string; receita: number }[];
let ranking: { nome: string | null; quantidade: number }[];

beforeEach(() => {
  vi.clearAllMocks();
  receita = [];
  ranking = [{ nome: "X-Salada", quantidade: 30 }];
  queryRaw.mockImplementation((partes: TemplateStringsArray) =>
    Promise.resolve(partes.join("").includes('"OrderItem"') ? ranking : receita)
  );
  paymentGroupBy.mockResolvedValue([
    { method: "CASH", _sum: { amount: 100 } },
    { method: "PIX", _sum: { amount: 50 } },
  ]);
});

describe("escopo de tenant", () => {
  it("filtra a receita pelo tenant explicitamente", async () => {
    await calcularGraficos(TENANT, AGORA);
    const { sql, valores } = daReceita();
    expect(sql).toMatch(/"tenantId" = \?/);
    expect(valores).toContain(TENANT);
  });

  it("filtra o ranking pelo tenant nas duas tabelas", async () => {
    await calcularGraficos(TENANT, AGORA);
    const { sql, valores } = doRanking();
    expect(sql).toMatch(/oi\."tenantId" = \?/);
    expect(sql).toMatch(/o\."tenantId" = \?/);
    expect(valores.filter((v) => v === TENANT)).toHaveLength(2);
  });

  it("filtra as formas de pagamento pelo tenant", async () => {
    await calcularGraficos(TENANT, AGORA);
    for (const [args] of paymentGroupBy.mock.calls) {
      expect(args.where.tenantId).toBe(TENANT);
    }
  });
});

describe("a definição de receita é a mesma dos cards", () => {
  it("conta entregue ou pago, e nunca cancelado", async () => {
    // FILTRO_DE_RECEITA em src/lib/faturamento.ts, traduzido para SQL.
    await calcularGraficos(TENANT, AGORA);
    const { sql } = daReceita();
    expect(sql).toContain("status = 'DELIVERED' OR \"paymentStatus\" = 'PAID'");
    expect(sql).toContain("status <> 'CANCELLED'");
  });

  it("agrupa pelo dia de São Paulo, não pelo dia UTC", async () => {
    await calcularGraficos(TENANT, AGORA);
    const { sql, valores } = daReceita();
    expect(sql).toContain("GROUP BY 1");
    expect(valores).toContain("America/Sao_Paulo");
  });

  it("tira pedido cancelado do ranking de itens", async () => {
    await calcularGraficos(TENANT, AGORA);
    expect(doRanking().sql).toContain("o.status <> 'CANCELLED'");
  });

  it("limita receita e ranking à mesma janela que o gráfico desenha", async () => {
    const { dailySales } = await calcularGraficos(TENANT, AGORA);
    // Primeiro balde do gráfico e primeiro dia da consulta são o mesmo dia:
    // sem isso, um dos dois lados busca ou desenha um dia que o outro ignora.
    expect(dailySales[0].date).toBe("2026-07-31");
    const inicio = new Date("2026-07-31T03:00:00.000Z");
    expect(daReceita().valores).toContainEqual(inicio);
    expect(doRanking().valores).toContainEqual(inicio);
  });
});

describe("os baldes do gráfico", () => {
  it("monta exatamente 30 dias, terminando em hoje", async () => {
    receita = [{ dia: "2026-08-29", receita: 250 }];
    const { dailySales } = await calcularGraficos(TENANT, AGORA);

    expect(dailySales).toHaveLength(30);
    expect(dailySales[dailySales.length - 1]).toEqual({ date: "2026-08-29", revenue: 250 });
  });

  it("preenche com zero o dia sem venda", async () => {
    receita = [{ dia: "2026-08-28", receita: 100 }];
    const { dailySales } = await calcularGraficos(TENANT, AGORA);

    expect(dailySales.find((d) => d.date === "2026-08-28")!.revenue).toBe(100);
    expect(dailySales.find((d) => d.date === "2026-08-27")!.revenue).toBe(0);
  });

  it("ignora dia fora da janela em vez de criar balde novo", async () => {
    receita = [{ dia: "2020-01-01", receita: 999 }];
    const { dailySales } = await calcularGraficos(TENANT, AGORA);

    expect(dailySales).toHaveLength(30);
    expect(dailySales.every((d) => d.revenue === 0)).toBe(true);
  });
});

describe("ranking e pagamentos", () => {
  it("dá nome aos itens do ranking", async () => {
    const { topItems } = await calcularGraficos(TENANT, AGORA);
    expect(topItems).toEqual([{ name: "X-Salada", quantity: 30 }]);
  });

  it("não quebra o ranking quando o item foi excluído do cardápio", async () => {
    ranking = [{ nome: null, quantidade: 30 }];
    const { topItems } = await calcularGraficos(TENANT, AGORA);
    expect(topItems).toEqual([{ name: "Desconhecido", quantity: 30 }]);
  });

  it("preenche com zero a forma de pagamento sem movimento", async () => {
    const { paymentBreakdown } = await calcularGraficos(TENANT, AGORA);
    expect(paymentBreakdown.today).toEqual({ CASH: 100, CREDIT_CARD: 0, PIX: 50 });
  });

  it("faz todas as consultas de uma vez, sem nenhuma esperando a outra", async () => {
    // O nome dos itens vinha numa segunda consulta, disparada só depois do
    // ranking. Agora ele sai no JOIN: são quatro consultas, todas paralelas.
    let pendentes = 0;
    let maximo = 0;
    const segurar = <T,>(valor: T) => {
      pendentes++;
      maximo = Math.max(maximo, pendentes);
      return new Promise<T>((r) => setTimeout(() => (pendentes--, r(valor)), 0));
    };
    queryRaw.mockImplementation((partes: TemplateStringsArray) =>
      segurar(partes.join("").includes('"OrderItem"') ? ranking : receita)
    );
    paymentGroupBy.mockImplementation(() => segurar([]));

    await calcularGraficos(TENANT, AGORA);
    expect(maximo).toBe(4);
  });
});
