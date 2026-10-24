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
const graficosEmCache = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      aggregate: (...a: unknown[]) => orderAggregate(...a),
    },
  },
}));

// Os gráficos têm teste próprio, em src/lib/analytics.test.ts. Aqui interessa
// que a rota os peça para o tenant certo e os devolva como vieram.
vi.mock("@/lib/analytics", () => ({
  graficosEmCache: (...a: unknown[]) => graficosEmCache(...a),
}));

const GRAFICOS = {
  dailySales: [{ date: "2026-08-29", revenue: 250 }],
  topItems: [{ name: "X-Salada", quantity: 30 }],
  paymentBreakdown: {
    today: { CASH: 100, CREDIT_CARD: 0, PIX: 50 },
    month: { CASH: 100, CREDIT_CARD: 0, PIX: 50 },
  },
};

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
  graficosEmCache.mockResolvedValue(GRAFICOS);
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
    expect(graficosEmCache).not.toHaveBeenCalled();
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

  it("pede os gráficos do tenant da requisição e os devolve como vieram", async () => {
    const corpo = await (await GET(req())).json();
    expect(graficosEmCache).toHaveBeenCalledWith(TENANT);
    expect(corpo).toMatchObject(GRAFICOS);
  });

  it("devolve 500 genérico quando o banco falha", async () => {
    orderAggregate.mockRejectedValue(new Error("timeout"));
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});
