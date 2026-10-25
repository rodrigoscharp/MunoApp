/**
 * O dashboard do /adm (calcularPainel e companhia).
 *
 * Como em analytics.test.ts, os testes leem o texto das consultas: `$queryRaw`
 * não passa pela extensão de tenant, e um `tenantId` esquecido devolveria o
 * movimento de todos os restaurantes sem o banco reclamar.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const queryRaw = vi.fn();
const orderGroupBy = vi.fn();
const orderFindFirst = vi.fn();
const orderFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
    order: {
      groupBy: (...a: unknown[]) => orderGroupBy(...a),
      findFirst: (...a: unknown[]) => orderFindFirst(...a),
      findMany: (...a: unknown[]) => orderFindMany(...a),
    },
    payment: { groupBy: vi.fn() },
  },
}));

import { calcularHorarioDePico, calcularPainel, lerAoVivo, ultimosPedidos } from "./analytics";

const TENANT = "restaurante-a";
// Sábado, 24/10/2026, 21:30 em Brasília.
const AGORA = new Date("2026-10-25T00:30:00.000Z");

type Chamada = { sql: string; valores: unknown[] };
const chamadas = (): Chamada[] =>
  queryRaw.mock.calls.map(([partes, ...valores]) => ({
    sql: (partes as TemplateStringsArray).join("?"),
    valores,
  }));
const com = (trecho: string) => chamadas().find((c) => c.sql.includes(trecho))!;

let respostas: Record<string, unknown[]>;

beforeEach(() => {
  vi.clearAllMocks();
  respostas = {
    resumo: [
      {
        a_receita: 300, a_faturados: 10, a_pedidos: 12, a_cancelados: 1, a_semConta: 2,
        b_receita: 200, b_faturados: 8, b_pedidos: 9, b_cancelados: 3, b_semConta: 0,
      },
    ],
    dia: [{ dia: "2026-10-24", receita: 120, faturados: 4, pedidos: 5, cancelados: 0 }],
    tipo: [{ tipo: "DELIVERY", pedidos: 7, faturados: 6, receita: 200 }],
    forma: [{ forma: "PIX", pedidos: 8 }],
    item: [],
    cliente: [{ primeiro: new Date("2026-10-20T12:00:00.000Z"), pedidos: 2 }],
    cupom: [
      { codigo: "BEMVINDO", usos: 3, desconto: 30, pedidos: 150, usos_total: 5, desconto_total: 40, pedidos_total: 220 },
    ],
    moto: [{ id: "m1", nome: "João", entregas: 4, segundos: 1260 }],
    calor: [{ diaDaSemana: 5, hora: 20, pedidos: 7 }],
  };
  queryRaw.mockImplementation((partes: TemplateStringsArray) => {
    const sql = partes.join("");
    const chave = sql.includes("a_receita")
      ? "resumo"
      : sql.includes("to_char")
        ? "dia"
        : sql.includes('"deliveryType" AS tipo')
          ? "tipo"
          : sql.includes('"paymentMethod" AS forma')
            ? "forma"
            : sql.includes('"OrderItem"')
              ? "item"
              : sql.includes("no_periodo")
                ? "cliente"
                : sql.includes('"couponCode"')
                  ? "cupom"
                  : sql.includes('"DeliveryTracking"')
                    ? "moto"
                    : "calor";
    return Promise.resolve(respostas[chave]);
  });
});

describe("escopo de tenant", () => {
  it("toda consulta do painel filtra o tenant explicitamente", async () => {
    await calcularPainel(TENANT, "7d", AGORA);
    const todas = chamadas();
    expect(todas).toHaveLength(8);
    for (const { sql, valores } of todas) {
      expect(sql).toMatch(/"tenantId" = \?/);
      expect(valores).toContain(TENANT);
    }
  });

  it("os joins também levam o tenant: itens, primeiro pedido, motoboy e rastreamento", async () => {
    await calcularPainel(TENANT, "7d", AGORA);
    expect(com('"OrderItem"').sql).toMatch(/oi\."tenantId" = \?[\s\S]*o\."tenantId" = \?/);
    expect(com("no_periodo").sql).toMatch(/o\."tenantId" = \?/);
    const moto = com('"DeliveryTracking"').sql;
    expect(moto).toMatch(/u\."tenantId" = \?/);
    expect(moto).toMatch(/dt\."tenantId" = \?/);
    expect(moto).toMatch(/o\."tenantId" = \?/);
  });

  it("o horário de pico filtra o tenant", async () => {
    await calcularHorarioDePico(TENANT, AGORA);
    const { sql, valores } = chamadas()[0];
    expect(sql).toMatch(/"tenantId" = \?/);
    expect(valores).toContain(TENANT);
  });

  it("o ao vivo e os últimos pedidos filtram o tenant", async () => {
    orderGroupBy.mockResolvedValue([]);
    orderFindFirst.mockResolvedValue(null);
    orderFindMany.mockResolvedValue([]);
    await lerAoVivo(TENANT);
    await ultimosPedidos(TENANT);
    expect(orderGroupBy.mock.calls[0][0].where.tenantId).toBe(TENANT);
    expect(orderFindFirst.mock.calls[0][0].where.tenantId).toBe(TENANT);
    expect(orderFindMany.mock.calls[0][0].where.tenantId).toBe(TENANT);
  });
});

describe("a regra de receita é a mesma dos cards", () => {
  it("o resumo e a série contam entregue ou pago, e nunca cancelado", async () => {
    await calcularPainel(TENANT, "7d", AGORA);
    for (const trecho of ["a_receita", "to_char"]) {
      const { sql } = com(trecho);
      expect(sql).toContain(`(status = 'DELIVERED' OR "paymentStatus" = 'PAID') AND status <> 'CANCELLED'`);
    }
  });

  it("como pediram, pagamento, ranking, clientes e cupons tiram o cancelado", async () => {
    await calcularPainel(TENANT, "7d", AGORA);
    for (const trecho of ['"deliveryType" AS tipo', '"paymentMethod" AS forma', "no_periodo", '"couponCode"']) {
      expect(com(trecho).sql).toContain("status <> 'CANCELLED'");
    }
    expect(com('"OrderItem"').sql).toContain("o.status <> 'CANCELLED'");
  });

  it("entrega só conta pedido entregue, com o tempo na rua limitado a medidas plausíveis", async () => {
    await calcularPainel(TENANT, "7d", AGORA);
    const { sql } = com('"DeliveryTracking"');
    expect(sql).toContain("o.status = 'DELIVERED'");
    expect(sql).toContain("BETWEEN interval '1 minute' AND interval '3 hours'");
  });
});

describe("janelas e fuso", () => {
  it("o resumo compara o período com o anterior de mesma duração", async () => {
    await calcularPainel(TENANT, "7d", AGORA);
    const { valores } = com("a_receita");
    expect(valores).toContainEqual(new Date("2026-10-18T03:00:00.000Z"));
    expect(valores).toContainEqual(new Date("2026-10-11T03:00:00.000Z"));
    expect(valores).toContainEqual(new Date("2026-10-18T00:30:00.000Z"));
  });

  it("a série de hoje desenha a semana e agrupa pelo dia de São Paulo", async () => {
    const d = await calcularPainel(TENANT, "hoje", AGORA);
    const { sql, valores } = com("to_char");
    expect(sql).toContain("GROUP BY 1");
    expect(valores).toContain("America/Sao_Paulo");
    expect(valores).toContainEqual(new Date("2026-10-18T03:00:00.000Z"));
    expect(d.porDia).toHaveLength(7);
    expect(d.porDia.at(-1)).toEqual({ dia: "2026-10-24", receita: 120, faturados: 4, pedidos: 5, cancelados: 0 });
    expect(d.porDia[0].receita).toBe(0);
  });

  it("o horário de pico usa dia da semana e hora de São Paulo, nos últimos 30 dias", async () => {
    const r = await calcularHorarioDePico(TENANT, AGORA);
    const { sql, valores } = chamadas()[0];
    expect(sql).toContain("extract(dow");
    expect(sql).toContain("extract(hour");
    expect(valores).toContain("America/Sao_Paulo");
    expect(valores).toContainEqual(new Date("2026-09-25T03:00:00.000Z"));
    expect(r).toEqual([{ diaDaSemana: 5, hora: 20, pedidos: 7 }]);
  });
});

describe("o formato que vai para o cache", () => {
  it("só número, texto e nulo, com as datas em ISO", async () => {
    const d = await calcularPainel(TENANT, "7d", AGORA);
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
    expect(d.atual).toEqual({ receita: 300, faturados: 10, pedidos: 12, cancelados: 1, semConta: 2 });
    expect(d.anterior.cancelados).toBe(3);
    expect(d.clientes).toEqual([{ primeiroPedido: "2026-10-20T12:00:00.000Z", pedidos: 2 }]);
    expect(d.cuponsTotal).toEqual({ usos: 5, desconto: 40, pedidos: 220 });
    expect(d.motoboys).toEqual([{ id: "m1", nome: "João", entregas: 4, minutosNaRua: 21 }]);
  });

  it("sem movimento, tudo zera em vez de quebrar", async () => {
    for (const k of Object.keys(respostas)) respostas[k] = [];
    const d = await calcularPainel(TENANT, "mes", AGORA);
    expect(d.atual.receita).toBe(0);
    expect(d.cuponsTotal).toEqual({ usos: 0, desconto: 0, pedidos: 0 });
    expect(d.porDia.every((x) => x.pedidos === 0)).toBe(true);
  });

  it("dispara todas as consultas de uma vez", async () => {
    let pendentes = 0;
    let maximo = 0;
    queryRaw.mockImplementation(() => {
      pendentes++;
      maximo = Math.max(maximo, pendentes);
      return new Promise((r) => setTimeout(() => (pendentes--, r([])), 0));
    });
    await calcularPainel(TENANT, "30d", AGORA);
    expect(maximo).toBe(8);
  });
});

describe("ao vivo", () => {
  it("conta por status e acha o mais antigo que ainda depende da cozinha", async () => {
    orderGroupBy.mockResolvedValue([
      { status: "PENDING", _count: { _all: 1 } },
      { status: "IN_PREPARATION", _count: { _all: 2 } },
      { status: "OUT_FOR_DELIVERY", _count: { _all: 1 } },
    ]);
    orderFindFirst.mockResolvedValue({ id: "p1", createdAt: new Date("2026-10-25T00:06:00.000Z") });
    const v = await lerAoVivo(TENANT);
    expect(v.total).toBe(4);
    expect(v.porStatus.READY).toBe(0);
    expect(v.maisAntigo).toEqual({ id: "p1", criadoEm: "2026-10-25T00:06:00.000Z" });
    expect(orderFindFirst.mock.calls[0][0].where.status.in).toEqual(["PENDING", "CONFIRMED", "IN_PREPARATION"]);
  });

  it("só olha as últimas 24 horas, como o quadro da cozinha", async () => {
    // Pedido PENDING esquecido há meses não é "na casa": aparecia como
    // "esperando há 116 dias" no ao vivo.
    orderGroupBy.mockResolvedValue([]);
    orderFindFirst.mockResolvedValue(null);
    const antes = Date.now();
    await lerAoVivo(TENANT);
    for (const chamada of [orderGroupBy.mock.calls[0][0], orderFindFirst.mock.calls[0][0]]) {
      const desde: Date = chamada.where.createdAt.gte;
      expect(antes - desde.getTime()).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 5);
      expect(antes - desde.getTime()).toBeLessThan(24 * 60 * 60 * 1000 + 5000);
    }
  });
});
