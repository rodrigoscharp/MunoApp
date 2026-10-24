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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    table: { findFirst: (...a: unknown[]) => tableFindFirst(...a) },
  },
}));

/** A parte da consulta que lê os pedidos, aninhada na da mesa. */
function consultaDosPedidos() {
  return tableFindFirst.mock.calls[0][0].select.orders;
}

const pedidosAbertos = [
  {
    id: "pedido-1",
    total: 42.5,
    customerName: "Ana",
    items: [
      { id: "oi-1", quantity: 2, unitPrice: 10, notes: null, menuItem: { name: "X-Salada" } },
    ],
  },
];

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
  tableFindFirst.mockResolvedValue({ number: 7, name: "Varanda", orders: pedidosAbertos });
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
  });

  it("exige que a mesa esteja ativa, e da mesa só pede número e nome", async () => {
    await GET(req(), params);
    const consulta = tableFindFirst.mock.calls[0][0];
    expect(consulta.where).toEqual({ token: TOKEN, active: true });
    expect(Object.keys(consulta.select).sort()).toEqual(["name", "number", "orders"]);
  });
});

describe("a rota é pública, então o select é a proteção", () => {
  it("pede ao banco apenas o que a conta precisa", async () => {
    await GET(req(), params);

    const consulta = consultaDosPedidos();
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
    expect(consultaDosPedidos()).not.toHaveProperty("include");
    expect(tableFindFirst.mock.calls[0][0]).not.toHaveProperty("include");
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
    expect(consultaDosPedidos().select).not.toHaveProperty(campo);
  });

  // Os pedidos vêm pela relação da mesa resolvida pelo token, e a leitura
  // aninhada não passa pela extensão de tenant: o tenantId tem de estar ali.
  it("lista só os pedidos em aberto da própria mesa, e do próprio restaurante", async () => {
    await GET(req(), params);
    expect(consultaDosPedidos().where).toEqual({
      tenantId: TENANT,
      paymentStatus: "UNPAID",
      status: { not: "CANCELLED" },
    });
  });
});

describe("resposta", () => {
  it("devolve número e nome da mesa, sem o id interno", async () => {
    const res = await GET(req(), params);
    const corpo = await res.json();

    expect(corpo.orders).toEqual(pedidosAbertos);

    expect(corpo.table).toEqual({ number: 7, name: "Varanda" });
    expect(corpo.table).not.toHaveProperty("id");
  });

  it("devolve os pedidos em ordem de chegada", async () => {
    await GET(req(), params);
    expect(consultaDosPedidos().orderBy).toEqual({ createdAt: "asc" });
  });

  it("responde com conta vazia quando a mesa não tem pedido aberto", async () => {
    tableFindFirst.mockResolvedValue({ number: 7, name: "Varanda", orders: [] });
    const res = await GET(req(), params);

    expect(res.status).toBe(200);
    expect((await res.json()).orders).toEqual([]);
  });

  it("devolve 500 genérico quando o banco falha", async () => {
    tableFindFirst.mockRejectedValue(new Error("timeout"));
    const res = await GET(req(), params);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Erro interno do servidor" });
  });
});
