/**
 * Os números do /adm.
 *
 * Tudo aqui é fuso de Brasília e a mesma definição de receita dos cards
 * (FILTRO_DE_RECEITA). Já foi errado nos dois eixos: `setHours(0,0,0,0)` num
 * servidor em UTC punha "hoje" três horas adiantado, e o filtro contava só
 * pedido pré-pago, deixando de fora o dinheiro recebido na entrega.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { FILTRO_DE_RECEITA } from "@/lib/faturamento";

const TENANT = "restaurante-a";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const orderAggregate = vi.fn();
const orderFindMany = vi.fn();
const orderItemGroupBy = vi.fn();
const paymentGroupBy = vi.fn();
const menuItemFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      aggregate: (...a: unknown[]) => orderAggregate(...a),
      findMany: (...a: unknown[]) => orderFindMany(...a),
    },
    orderItem: { groupBy: (...a: unknown[]) => orderItemGroupBy(...a) },
    payment: { groupBy: (...a: unknown[]) => paymentGroupBy(...a) },
    menuItem: { findMany: (...a: unknown[]) => menuItemFindMany(...a) },
  },
}));

import { GET } from "./route";

function req(comTenant = true) {
  return new NextRequest("http://localhost/api/analytics", {
    headers: comTenant ? { "x-tenant-id": TENANT } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  orderAggregate.mockResolvedValue({ _sum: { total: 500 }, _count: 12 });
  orderFindMany.mockResolvedValue([]);
  orderItemGroupBy.mockResolvedValue([{ menuItemId: "item-1", _sum: { quantity: 30 } }]);
  paymentGroupBy.mockResolvedValue([
    { method: "CASH", _sum: { amount: 100 } },
    { method: "PIX", _sum: { amount: 50 } },
  ]);
  menuItemFindMany.mockResolvedValue([{ id: "item-1", name: "X-Salada" }]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("autorização", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await GET(req(false));
    expect(res.status).toBe(400);
  });

  it("recusa visitante sem sessão", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req());

    expect(res.status).toBe(403);
    expect(orderAggregate).not.toHaveBeenCalled();
  });

  it.each(["CUSTOMER", "KITCHEN", "MOTOBOY"])("recusa role %s", async (role) => {
    auth.mockResolvedValue({ user: { id: "u", role } });
    const res = await GET(req());
    expect(res.status).toBe(403);
  });
});

describe("a definição de receita é a mesma dos cards", () => {
  it("aplica FILTRO_DE_RECEITA no total de hoje e do mês", async () => {
    await GET(req());

    expect(orderAggregate.mock.calls[0][0].where).toMatchObject(FILTRO_DE_RECEITA);
    expect(orderAggregate.mock.calls[1][0].where).toMatchObject(FILTRO_DE_RECEITA);
  });

  it("aplica o mesmo filtro na série de 30 dias", async () => {
    await GET(req());
    expect(orderFindMany.mock.calls[0][0].where).toMatchObject(FILTRO_DE_RECEITA);
  });

  it("tira pedido cancelado do ranking de itens", async () => {
    // Sem o filtro, um pedido grande cancelado empurrava o prato para o topo.
    await GET(req());
    expect(orderItemGroupBy.mock.calls[0][0].where).toEqual({
      order: { status: { not: "CANCELLED" } },
    });
  });
});

describe("os baldes do gráfico", () => {
  it("monta exatamente 30 dias", async () => {
    const res = await GET(req());
    expect((await res.json()).dailySales).toHaveLength(30);
  });

  it("classifica o pedido no dia de Brasília, não no dia UTC", async () => {
    // 2026-08-29T02:00Z é 2026-08-28 23:00 em Brasília: o movimento das 23h
    // pertence ao dia 28, não ao 29.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T12:00:00.000Z"));
    orderFindMany.mockResolvedValue([
      { createdAt: new Date("2026-08-29T02:00:00.000Z"), total: 100 },
    ]);

    const res = await GET(req());
    const { dailySales } = await res.json();

    const dia28 = dailySales.find((d: { date: string }) => d.date === "2026-08-28");
    const dia29 = dailySales.find((d: { date: string }) => d.date === "2026-08-29");
    expect(dia28.revenue).toBe(100);
    expect(dia29.revenue).toBe(0);
    expect(dia29).toBeDefined();
  });

  it("termina em hoje, e o movimento de hoje entra no gráfico", async () => {
    // A janela ia de D-30 a D-1 enquanto a consulta trazia >= D-30: os pedidos
    // de hoje chegavam e eram descartados pelo `key in dailyMap`.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T12:00:00.000Z"));
    orderFindMany.mockResolvedValue([
      { createdAt: new Date("2026-08-29T12:00:00.000Z"), total: 250 },
    ]);

    const { dailySales } = await (await GET(req())).json();

    expect(dailySales[dailySales.length - 1]).toEqual({
      date: "2026-08-29",
      revenue: 250,
    });
  });

  it("busca exatamente a janela que desenha", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T12:00:00.000Z"));

    const { dailySales } = await (await GET(req())).json();
    const inicioDaConsulta = orderFindMany.mock.calls[0][0].where.createdAt.gte;

    // Primeiro balde do gráfico e primeiro dia da consulta são o mesmo dia:
    // sem isso, um dos dois lados busca ou desenha um dia que o outro ignora.
    expect(dailySales[0].date).toBe("2026-07-31");
    expect(new Date(inicioDaConsulta).toISOString()).toBe("2026-07-31T03:00:00.000Z");
  });

  it("ignora pedido fora da janela em vez de criar balde novo", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T12:00:00.000Z"));
    orderFindMany.mockResolvedValue([
      { createdAt: new Date("2020-01-01T12:00:00.000Z"), total: 999 },
    ]);

    const res = await GET(req());
    const { dailySales } = await res.json();

    expect(dailySales).toHaveLength(30);
    expect(dailySales.every((d: { revenue: number }) => d.revenue === 0)).toBe(true);
  });
});

describe("resposta", () => {
  it("resume hoje e o mês", async () => {
    const res = await GET(req());
    const corpo = await res.json();

    expect(corpo.today).toEqual({ revenue: 500, orders: 12 });
    expect(corpo.month).toEqual({ revenue: 500, orders: 12 });
  });

  it("trata soma nula como zero", async () => {
    orderAggregate.mockResolvedValue({ _sum: { total: null }, _count: 0 });
    const corpo = await (await GET(req())).json();
    expect(corpo.today.revenue).toBe(0);
  });

  it("dá nome aos itens do ranking", async () => {
    const corpo = await (await GET(req())).json();
    expect(corpo.topItems).toEqual([{ name: "X-Salada", quantity: 30 }]);
  });

  it("não quebra o ranking quando o item foi excluído do cardápio", async () => {
    menuItemFindMany.mockResolvedValue([]);
    const corpo = await (await GET(req())).json();
    expect(corpo.topItems).toEqual([{ name: "Desconhecido", quantity: 30 }]);
  });

  it("preenche com zero a forma de pagamento sem movimento", async () => {
    const corpo = await (await GET(req())).json();
    expect(corpo.paymentBreakdown.today).toEqual({
      CASH: 100,
      CREDIT_CARD: 0,
      PIX: 50,
    });
  });

  it("devolve 500 genérico quando o banco falha", async () => {
    orderAggregate.mockRejectedValue(new Error("timeout"));
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});
