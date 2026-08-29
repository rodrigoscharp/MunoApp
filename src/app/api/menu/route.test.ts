/**
 * O cardápio: leitura pública e criação de item pelo admin.
 *
 * A armadilha desta rota não é a autorização, é o `categoryId` do corpo. A
 * extensão de tenant escopa a LINHA criada, não os ids que vão dentro do `data`
 * — e a foreign key é global. Sem a conferência da categoria contra o banco, um
 * item nasceria pendurado na categoria de outro restaurante.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "restaurante-a";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const categoryFindMany = vi.fn();
const categoryFindUnique = vi.fn();
const menuItemCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    category: {
      findMany: (...a: unknown[]) => categoryFindMany(...a),
      findUnique: (...a: unknown[]) => categoryFindUnique(...a),
    },
    menuItem: { create: (...a: unknown[]) => menuItemCreate(...a) },
  },
}));

import { GET, POST } from "./route";

function reqGet(comTenant = true) {
  return new NextRequest("http://localhost/api/menu", {
    headers: comTenant ? { "x-tenant-id": TENANT } : {},
  });
}

function reqPost(body: Record<string, unknown>, comTenant = true) {
  return new NextRequest("http://localhost/api/menu", {
    method: "POST",
    headers: {
      ...(comTenant ? { "x-tenant-id": TENANT } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const itemValido = {
  name: "X-Salada",
  price: 25.9,
  categoryId: "cat-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  categoryFindMany.mockResolvedValue([{ id: "cat-1", name: "Lanches", items: [] }]);
  categoryFindUnique.mockResolvedValue({ id: "cat-1" });
  menuItemCreate.mockResolvedValue({ id: "item-novo", name: "X-Salada" });
});

describe("GET — o cardápio que o cliente vê", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await GET(reqGet(false));
    expect(res.status).toBe(400);
  });

  it("não exige login: o cardápio é público", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(reqGet());
    expect(res.status).toBe(200);
  });

  it("esconde item indisponível", async () => {
    await GET(reqGet());
    expect(categoryFindMany.mock.calls[0][0].include.items.where).toEqual({ available: true });
  });

  it("entrega as categorias na ordem definida pelo dono", async () => {
    await GET(reqGet());
    expect(categoryFindMany.mock.calls[0][0].orderBy).toEqual({ position: "asc" });
  });

  it("ordena os itens por nome dentro da categoria", async () => {
    await GET(reqGet());
    expect(categoryFindMany.mock.calls[0][0].include.items.orderBy).toEqual({ name: "asc" });
  });
});

describe("POST — quem pode criar item", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await POST(reqPost(itemValido, false));
    expect(res.status).toBe(400);
    expect(menuItemCreate).not.toHaveBeenCalled();
  });

  it("recusa visitante sem sessão", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(reqPost(itemValido));
    expect(res.status).toBe(403);
    expect(menuItemCreate).not.toHaveBeenCalled();
  });

  it.each(["CUSTOMER", "KITCHEN", "MOTOBOY"])("recusa role %s", async (role) => {
    auth.mockResolvedValue({ user: { id: "u", role } });
    const res = await POST(reqPost(itemValido));
    expect(res.status).toBe(403);
    expect(menuItemCreate).not.toHaveBeenCalled();
  });
});

describe("POST — corpo", () => {
  it.each([
    ["nome vazio", { ...itemValido, name: "" }],
    ["preço zero", { ...itemValido, price: 0 }],
    ["preço negativo", { ...itemValido, price: -5 }],
    ["preço como texto", { ...itemValido, price: "25,90" }],
    ["sem categoria", { name: "X", price: 10 }],
    ["imageUrl que não é URL", { ...itemValido, imageUrl: "foto.png" }],
  ])("recusa %s", async (_nome, corpo) => {
    const res = await POST(reqPost(corpo));
    expect(res.status).toBe(400);
    expect(menuItemCreate).not.toHaveBeenCalled();
  });

  it("assume disponível quando o corpo não diz", async () => {
    await POST(reqPost(itemValido));
    expect(menuItemCreate.mock.calls[0][0].data.available).toBe(true);
  });

  it("aceita item criado já indisponível", async () => {
    await POST(reqPost({ ...itemValido, available: false }));
    expect(menuItemCreate.mock.calls[0][0].data.available).toBe(false);
  });
});

describe("POST — a categoria é resolvida contra o banco", () => {
  it("recusa categoria de outro restaurante com 422", async () => {
    // A consulta já vem escopada pela extensão: a categoria do restaurante B
    // não é encontrada aqui, e a foreign key global nunca chega a ser exercida.
    categoryFindUnique.mockResolvedValue(null);
    const res = await POST(reqPost({ ...itemValido, categoryId: "cat-de-outro" }));

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Categoria não encontrada" });
    expect(menuItemCreate).not.toHaveBeenCalled();
  });

  it("confere a categoria antes de criar", async () => {
    await POST(reqPost(itemValido));

    expect(categoryFindUnique).toHaveBeenCalledWith({
      where: { id: "cat-1" },
      select: { id: true },
    });
    expect(categoryFindUnique.mock.invocationCallOrder[0]).toBeLessThan(
      menuItemCreate.mock.invocationCallOrder[0]
    );
  });

  it("cria o item preso ao tenant da request", async () => {
    await POST(reqPost({ ...itemValido, tenantId: "restaurante-b" }));
    expect(menuItemCreate.mock.calls[0][0].data.tenantId).toBe(TENANT);
  });

  it("responde 201 com o item criado", async () => {
    const res = await POST(reqPost(itemValido));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: "item-novo" });
  });
});
