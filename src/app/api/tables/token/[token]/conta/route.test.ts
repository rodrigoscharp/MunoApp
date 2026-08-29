/**
 * A conta da mesa, aberta pelo QR.
 *
 * Esta rota é **pública**: não tem sessão, e quem fotografa o QR vê a conta —
 * isso é o desejado. O que não é desejado já aconteceu: com `include` no lugar
 * de `select`, a resposta trazia a linha inteira de Order (telefone, endereço de
 * entrega, observações, userId, id de pagamento no gateway) de todos os pedidos
 * abertos da mesa, para qualquer pessoa que apontasse a câmera.
 *
 * O teste central abaixo não confere o que a rota devolve, e sim **o que ela
 * pede ao banco** — porque é o `select` fechado que impede o vazamento, e trocar
 * `select` por `include` voltaria a passar num teste que só olhasse o caminho
 * feliz.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "restaurante-a";
const TOKEN = "token-da-mesa";

const tableFindFirst = vi.fn();
const orderFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    table: { findFirst: (...a: unknown[]) => tableFindFirst(...a) },
    order: { findMany: (...a: unknown[]) => orderFindMany(...a) },
  },
}));

import { GET } from "./route";

const params = { params: Promise.resolve({ token: TOKEN }) };

function req({
  tenant = true,
  plano = "MEMBRO_MESA_QR",
}: { tenant?: boolean; plano?: string | null } = {}) {
  return new NextRequest(`http://localhost/api/tables/token/${TOKEN}/conta`, {
    headers: {
      ...(tenant ? { "x-tenant-id": TENANT } : {}),
      ...(plano ? { "x-tenant-plano": plano } : {}),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  tableFindFirst.mockResolvedValue({ id: "mesa-1", number: 7, name: "Varanda" });
  orderFindMany.mockResolvedValue([
    {
      id: "pedido-1",
      total: 42.5,
      customerName: "Ana",
      items: [
        { id: "oi-1", quantity: 2, unitPrice: 10, notes: null, menuItem: { name: "X-Salada" } },
      ],
    },
  ]);
});

describe("porta de entrada", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await GET(req({ tenant: false }), params);
    expect(res.status).toBe(400);
    expect(tableFindFirst).not.toHaveBeenCalled();
  });

  it("recusa restaurante sem o plano de mesa QR", async () => {
    const res = await GET(req({ plano: "MEMBRO" }), params);
    expect(res.status).toBe(403);
    expect(tableFindFirst).not.toHaveBeenCalled();
  });

  it("recusa quando o header de plano não veio", async () => {
    const res = await GET(req({ plano: null }), params);
    expect(res.status).toBe(403);
  });

  it("404 para QR de mesa desativada ou inexistente", async () => {
    tableFindFirst.mockResolvedValue(null);
    const res = await GET(req(), params);

    expect(res.status).toBe(404);
    expect(orderFindMany).not.toHaveBeenCalled();
  });

  it("exige que a mesa esteja ativa", async () => {
    await GET(req(), params);
    expect(tableFindFirst).toHaveBeenCalledWith({
      where: { token: TOKEN, active: true },
      select: { id: true, number: true, name: true },
    });
  });
});

describe("a rota é pública, então o select é a proteção", () => {
  it("pede ao banco apenas o que a conta precisa", async () => {
    await GET(req(), params);

    const consulta = orderFindMany.mock.calls[0][0];
    expect(consulta.select).toEqual({
      id: true,
      total: true,
      customerName: true,
      items: {
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          notes: true,
          menuItem: { select: { name: true } },
        },
      },
    });
  });

  it("nunca usa include, que traria a linha inteira do pedido", async () => {
    await GET(req(), params);
    expect(orderFindMany.mock.calls[0][0]).not.toHaveProperty("include");
  });

  it.each([
    "customerPhone",
    "deliveryAddress",
    "notes",
    "userId",
    "mpPaymentId",
    "couponCode",
  ])("não pede o campo %s", async (campo) => {
    await GET(req(), params);
    expect(orderFindMany.mock.calls[0][0].select).not.toHaveProperty(campo);
  });

  it("lista só os pedidos em aberto da própria mesa", async () => {
    await GET(req(), params);
    expect(orderFindMany.mock.calls[0][0].where).toEqual({
      tableId: "mesa-1",
      paymentStatus: "UNPAID",
      status: { not: "CANCELLED" },
    });
  });

  it("usa o id da mesa resolvida pelo token, não o token cru", async () => {
    await GET(req(), params);
    expect(orderFindMany.mock.calls[0][0].where.tableId).toBe("mesa-1");
  });
});

describe("resposta", () => {
  it("devolve número e nome da mesa, sem o id interno", async () => {
    const res = await GET(req(), params);
    const corpo = await res.json();

    expect(corpo.table).toEqual({ number: 7, name: "Varanda" });
    expect(corpo.table).not.toHaveProperty("id");
  });

  it("devolve os pedidos em ordem de chegada", async () => {
    await GET(req(), params);
    expect(orderFindMany.mock.calls[0][0].orderBy).toEqual({ createdAt: "asc" });
  });

  it("responde com conta vazia quando a mesa não tem pedido aberto", async () => {
    orderFindMany.mockResolvedValue([]);
    const res = await GET(req(), params);

    expect(res.status).toBe(200);
    expect((await res.json()).orders).toEqual([]);
  });

  it("devolve 500 genérico quando o banco falha", async () => {
    orderFindMany.mockRejectedValue(new Error("timeout"));
    const res = await GET(req(), params);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Erro interno do servidor" });
  });
});
