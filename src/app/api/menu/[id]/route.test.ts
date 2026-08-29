/**
 * Item do cardápio: leitura, edição e exclusão.
 *
 * Dois contratos que só aparecem no caminho de erro:
 *
 *  - **P2025 vira 404, não 500.** Com o escopo de tenant embutido no `where`,
 *    "nenhuma linha casou" significa "não existe" *ou* "não é seu" — e as duas
 *    respostas precisam ser idênticas, senão o 500 vira um oráculo que confirma
 *    a existência do item de outro restaurante.
 *  - **P2003 vira 409 com instrução.** Item já pedido não pode ser apagado sem
 *    destruir o histórico; o admin precisa ouvir "desative", não "erro interno".
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const TENANT = "restaurante-a";
const ITEM_ID = "item-1";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const menuItemFindUnique = vi.fn();
const menuItemUpdate = vi.fn();
const menuItemDelete = vi.fn();
const categoryFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    menuItem: {
      findUnique: (...a: unknown[]) => menuItemFindUnique(...a),
      update: (...a: unknown[]) => menuItemUpdate(...a),
      delete: (...a: unknown[]) => menuItemDelete(...a),
    },
    category: { findUnique: (...a: unknown[]) => categoryFindUnique(...a) },
  },
}));

import { GET, PUT, DELETE } from "./route";

const params = { params: Promise.resolve({ id: ITEM_ID }) };

function req(
  method: string,
  body?: Record<string, unknown>,
  comTenant = true
) {
  return new NextRequest(`http://localhost/api/menu/${ITEM_ID}`, {
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

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  menuItemFindUnique.mockResolvedValue({ id: ITEM_ID, name: "X-Salada", category: {} });
  menuItemUpdate.mockResolvedValue({ id: ITEM_ID, name: "X-Bacon" });
  menuItemDelete.mockResolvedValue({});
  categoryFindUnique.mockResolvedValue({ id: "cat-1" });
});

describe("GET", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await GET(req("GET", undefined, false), params);
    expect(res.status).toBe(400);
  });

  it("devolve o item com a categoria", async () => {
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect(menuItemFindUnique).toHaveBeenCalledWith({
      where: { id: ITEM_ID },
      include: { category: true },
    });
  });

  it("404 para item de outro restaurante — mesma resposta de inexistente", async () => {
    menuItemFindUnique.mockResolvedValue(null);
    const res = await GET(req("GET"), params);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Não encontrado" });
  });
});

describe("PUT — autorização", () => {
  it("recusa visitante sem sessão", async () => {
    auth.mockResolvedValue(null);
    const res = await PUT(req("PUT", { name: "X-Bacon" }), params);
    expect(res.status).toBe(403);
    expect(menuItemUpdate).not.toHaveBeenCalled();
  });

  it.each(["CUSTOMER", "KITCHEN", "MOTOBOY"])("recusa role %s", async (role) => {
    auth.mockResolvedValue({ user: { id: "u", role } });
    const res = await PUT(req("PUT", { name: "X-Bacon" }), params);
    expect(res.status).toBe(403);
  });
});

describe("PUT — edição parcial", () => {
  it("aceita mudar só a disponibilidade", async () => {
    const res = await PUT(req("PUT", { available: false }), params);

    expect(res.status).toBe(200);
    expect(menuItemUpdate).toHaveBeenCalledWith({
      where: { id: ITEM_ID },
      data: { available: false },
    });
  });

  it("aceita limpar a imagem com null", async () => {
    await PUT(req("PUT", { imageUrl: null }), params);
    expect(menuItemUpdate.mock.calls[0][0].data).toEqual({ imageUrl: null });
  });

  it.each([
    ["preço zero", { price: 0 }],
    ["preço negativo", { price: -1 }],
    ["nome vazio", { name: "" }],
    ["imageUrl que não é URL", { imageUrl: "foto.png" }],
  ])("recusa %s", async (_nome, corpo) => {
    const res = await PUT(req("PUT", corpo), params);
    expect(res.status).toBe(400);
    expect(menuItemUpdate).not.toHaveBeenCalled();
  });

  it("não deixa o corpo trocar o tenant do item", async () => {
    await PUT(req("PUT", { name: "X-Bacon", tenantId: "restaurante-b" }), params);
    expect(menuItemUpdate.mock.calls[0][0].data).not.toHaveProperty("tenantId");
  });
});

describe("PUT — a categoria continua sendo resolvida contra o banco", () => {
  it("recusa categoria de outro restaurante com 422", async () => {
    categoryFindUnique.mockResolvedValue(null);
    const res = await PUT(req("PUT", { categoryId: "cat-de-outro" }), params);

    expect(res.status).toBe(422);
    expect(menuItemUpdate).not.toHaveBeenCalled();
  });

  it("não consulta categoria quando o corpo não a menciona", async () => {
    await PUT(req("PUT", { name: "X-Bacon" }), params);
    expect(categoryFindUnique).not.toHaveBeenCalled();
  });
});

describe("PUT — item que não é deste restaurante", () => {
  it("responde 404 quando o update não casa nenhuma linha", async () => {
    menuItemUpdate.mockRejectedValue(erroPrisma("P2025"));
    const res = await PUT(req("PUT", { name: "X-Bacon" }), params);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Não encontrado" });
  });

  it("deixa erro desconhecido virar 500, sem mascarar de 404", async () => {
    menuItemUpdate.mockRejectedValue(erroPrisma("P2002"));
    const res = await PUT(req("PUT", { name: "X-Bacon" }), params);
    expect(res.status).toBe(500);
  });
});

describe("DELETE", () => {
  it("recusa quem não é ADMIN", async () => {
    auth.mockResolvedValue({ user: { id: "u", role: "CUSTOMER" } });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(403);
    expect(menuItemDelete).not.toHaveBeenCalled();
  });

  it("apaga o item", async () => {
    const res = await DELETE(req("DELETE"), params);

    expect(res.status).toBe(200);
    expect(menuItemDelete).toHaveBeenCalledWith({ where: { id: ITEM_ID } });
    expect(await res.json()).toEqual({ success: true });
  });

  it("404 para item inexistente ou de outro restaurante", async () => {
    menuItemDelete.mockRejectedValue(erroPrisma("P2025"));
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(404);
  });

  it("409 com instrução quando o item já foi pedido", async () => {
    // Apagar destruiria o histórico: o recibo perderia o nome do prato.
    menuItemDelete.mockRejectedValue(erroPrisma("P2003"));
    const res = await DELETE(req("DELETE"), params);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("Desative-o");
  });

  it("erro desconhecido continua sendo 500", async () => {
    menuItemDelete.mockRejectedValue(new Error("connection terminated"));
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(500);
  });
});
