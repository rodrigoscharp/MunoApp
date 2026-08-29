/**
 * As categorias do cardápio.
 *
 * `Category` tem `@@unique([tenantId, slug])`. Mesma história das mesas e dos
 * cupons: sem tratar a colisão, o admin que repete um slug recebe "Erro interno
 * do servidor" e não tem como adivinhar o motivo.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const TENANT = "restaurante-a";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const categoryFindMany = vi.fn();
const categoryCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    category: {
      findMany: (...a: unknown[]) => categoryFindMany(...a),
      create: (...a: unknown[]) => categoryCreate(...a),
    },
  },
}));

import { GET, POST } from "./route";

function req(method: string, body?: Record<string, unknown>, comTenant = true) {
  return new NextRequest("http://localhost/api/categories", {
    method,
    headers: {
      ...(comTenant ? { "x-tenant-id": TENANT } : {}),
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

const categoriaValida = { name: "Lanches", slug: "lanches" };

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  categoryFindMany.mockResolvedValue([{ id: "cat-1", name: "Lanches", position: 0 }]);
  categoryCreate.mockResolvedValue({ id: "cat-nova", name: "Lanches", slug: "lanches" });
});

describe("GET", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await GET(req("GET", undefined, false));
    expect(res.status).toBe(400);
  });

  it("não exige login: a lista alimenta o cardápio público", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
  });

  it("entrega na ordem definida pelo dono", async () => {
    await GET(req("GET"));
    expect(categoryFindMany).toHaveBeenCalledWith({ orderBy: { position: "asc" } });
  });
});

describe("POST — autorização", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await POST(req("POST", categoriaValida, false));
    expect(res.status).toBe(400);
    expect(categoryCreate).not.toHaveBeenCalled();
  });

  it("recusa visitante sem sessão", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(req("POST", categoriaValida));
    expect(res.status).toBe(403);
  });

  it.each(["CUSTOMER", "KITCHEN", "MOTOBOY"])("recusa role %s", async (role) => {
    auth.mockResolvedValue({ user: { id: "u", role } });
    const res = await POST(req("POST", categoriaValida));
    expect(res.status).toBe(403);
    expect(categoryCreate).not.toHaveBeenCalled();
  });
});

describe("POST — corpo", () => {
  it.each([
    ["nome vazio", { name: "", slug: "lanches" }],
    ["sem slug", { name: "Lanches" }],
    ["slug vazio", { name: "Lanches", slug: "" }],
    ["posição fracionada", { ...categoriaValida, position: 1.5 }],
  ])("recusa %s", async (_nome, corpo) => {
    const res = await POST(req("POST", corpo));
    expect(res.status).toBe(400);
    expect(categoryCreate).not.toHaveBeenCalled();
  });

  it("assume posição zero quando o corpo não diz", async () => {
    await POST(req("POST", categoriaValida));
    expect(categoryCreate.mock.calls[0][0].data.position).toBe(0);
  });

  it("cria presa ao tenant da request", async () => {
    await POST(req("POST", { ...categoriaValida, tenantId: "restaurante-b" }));
    expect(categoryCreate.mock.calls[0][0].data.tenantId).toBe(TENANT);
  });

  it("responde 201 com a categoria criada", async () => {
    const res = await POST(req("POST", categoriaValida));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: "cat-nova" });
  });
});

describe("POST — slug repetido", () => {
  it("responde 409 em vez de 500", async () => {
    // @@unique([tenantId, slug]) no schema.
    categoryCreate.mockRejectedValue(erroPrisma("P2002"));
    const res = await POST(req("POST", categoriaValida));

    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json()).toLowerCase()).toContain("categoria");
  });

  it("erro desconhecido continua sendo 500", async () => {
    categoryCreate.mockRejectedValue(new Error("connection terminated"));
    const res = await POST(req("POST", categoriaValida));
    expect(res.status).toBe(500);
  });
});
