/**
 * As mesas do salão.
 *
 * `Table` tem `@@unique([tenantId, number])` no schema: criar a mesa 5 duas
 * vezes colide no banco. A rota de cupons já trata exatamente essa colisão
 * (P2002 → 409 com mensagem), justamente porque sem o catch o admin só vê "Erro
 * interno do servidor" e não descobre que o número já existe. Aqui a mesma
 * colisão precisa da mesma resposta.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const TENANT = "restaurante-a";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const tableFindMany = vi.fn();
const tableCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    table: {
      findMany: (...a: unknown[]) => tableFindMany(...a),
      create: (...a: unknown[]) => tableCreate(...a),
    },
  },
}));

import { GET, POST } from "./route";

function req(
  method: string,
  body?: Record<string, unknown>,
  { tenant = true, plano = "MEMBRO_MESA_QR" }: { tenant?: boolean; plano?: string | null } = {}
) {
  return new NextRequest("http://localhost/api/tables", {
    method,
    headers: {
      ...(tenant ? { "x-tenant-id": TENANT } : {}),
      ...(plano ? { "x-tenant-plano": plano } : {}),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function erroPrisma(code: string) {
  return new Prisma.PrismaClientKnownRequestError("falhou", {
    code,
    clientVersion: "6.19.3",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  tableFindMany.mockResolvedValue([
    {
      id: "mesa-1",
      number: 1,
      name: "Janela",
      orders: [{ total: 30 }, { total: 20 }],
    },
    { id: "mesa-2", number: 2, name: null, orders: [] },
  ]);
  tableCreate.mockResolvedValue({ id: "mesa-nova", number: 5, name: "Varanda" });
});

describe("plano e autorização", () => {
  it.each([
    ["GET", () => GET(req("GET"), )],
  ])("%s recusa sem tenant resolvido", async () => {
    const res = await GET(req("GET", undefined, { tenant: false }));
    expect(res.status).toBe(400);
  });

  it("GET recusa restaurante sem o plano de mesa QR", async () => {
    const res = await GET(req("GET", undefined, { plano: "MEMBRO" }));
    expect(res.status).toBe(403);
    expect(tableFindMany).not.toHaveBeenCalled();
  });

  it("POST recusa restaurante sem o plano de mesa QR", async () => {
    const res = await POST(req("POST", { number: 5 }, { plano: "MEMBRO" }));
    expect(res.status).toBe(403);
    expect(tableCreate).not.toHaveBeenCalled();
  });

  it("recusa quando o header de plano não veio, em vez de liberar", async () => {
    const res = await GET(req("GET", undefined, { plano: null }));
    expect(res.status).toBe(403);
  });

  it.each(["CUSTOMER", "KITCHEN", "MOTOBOY"])("GET recusa role %s", async (role) => {
    auth.mockResolvedValue({ user: { id: "u", role } });
    const res = await GET(req("GET"));
    expect(res.status).toBe(403);
  });

  it("POST recusa visitante sem sessão", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(req("POST", { number: 5 }));
    expect(res.status).toBe(403);
    expect(tableCreate).not.toHaveBeenCalled();
  });
});

describe("GET — o salão com as contas abertas", () => {
  it("resume pedidos em aberto por mesa, sem devolver os pedidos", async () => {
    const res = await GET(req("GET"));
    const corpo = await res.json();

    expect(corpo[0]).toMatchObject({ id: "mesa-1", openOrdersCount: 2, openTotal: 50 });
    expect(corpo[0]).not.toHaveProperty("orders");
  });

  it("mostra mesa sem pedido com total zero", async () => {
    const corpo = await (await GET(req("GET"))).json();
    expect(corpo[1]).toMatchObject({ openOrdersCount: 0, openTotal: 0 });
  });

  it("conta só pedido não cancelado e não pago", async () => {
    await GET(req("GET"));
    expect(tableFindMany.mock.calls[0][0].include.orders.where).toEqual({
      status: { not: "CANCELLED" },
      paymentStatus: "UNPAID",
    });
  });

  it("ordena as mesas por número", async () => {
    await GET(req("GET"));
    expect(tableFindMany.mock.calls[0][0].orderBy).toEqual({ number: "asc" });
  });
});

describe("POST — corpo", () => {
  it.each([
    ["sem número", { name: "Varanda" }],
    ["número zero", { number: 0 }],
    ["número negativo", { number: -1 }],
    ["número fracionado", { number: 1.5 }],
    ["número como texto", { number: "5" }],
  ])("recusa %s", async (_nome, corpo) => {
    const res = await POST(req("POST", corpo));
    expect(res.status).toBe(400);
    expect(tableCreate).not.toHaveBeenCalled();
  });

  it("cria a mesa presa ao tenant da request", async () => {
    await POST(req("POST", { number: 5, name: "Varanda", tenantId: "restaurante-b" }));
    expect(tableCreate).toHaveBeenCalledWith({
      data: { tenantId: TENANT, number: 5, name: "Varanda" },
    });
  });

  it("aceita mesa sem nome", async () => {
    const res = await POST(req("POST", { number: 5 }));
    expect(res.status).toBe(201);
  });

  it("não deixa o corpo escolher o token do QR", async () => {
    // O token é a credencial do QR: gerado pelo banco, nunca informado.
    await POST(req("POST", { number: 5, token: "token-escolhido" }));
    expect(tableCreate.mock.calls[0][0].data).not.toHaveProperty("token");
  });
});

describe("POST — número de mesa repetido", () => {
  it("responde 409 dizendo que o número já existe", async () => {
    // @@unique([tenantId, number]) no schema.
    tableCreate.mockRejectedValue(erroPrisma("P2002"));
    const res = await POST(req("POST", { number: 5 }));

    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).toContain("número");
  });

  it("erro desconhecido continua sendo 500", async () => {
    tableCreate.mockRejectedValue(new Error("connection terminated"));
    const res = await POST(req("POST", { number: 5 }));
    expect(res.status).toBe(500);
  });
});
