import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));
const { upsert, findUnique, revalidateTag } = vi.hoisted(() => ({
  upsert: vi.fn(),
  findUnique: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidateTag, unstable_cache: (f: unknown) => f }));
vi.mock("@/lib/prisma", () => ({
  prisma: { setting: { upsert }, menuItem: { findUnique } },
}));

import { PUT } from "./route";

const put = (body: unknown) =>
  new NextRequest("http://localhost/api/settings/banner", {
    method: "PUT",
    headers: { "x-tenant-id": "rest-a", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "a", role: "ADMIN", tenantId: "rest-a" } });
  findUnique.mockResolvedValue({ id: "item-1", available: true });
});

describe("PUT /api/settings/banner", () => {
  it("grava o item escolhido com a chamada e limpa o cache do banner", async () => {
    const res = await PUT(put({ modo: "item", itemId: "item-1", chamada: "Lançamento" }));
    expect(res.status).toBe(200);
    expect(JSON.parse(upsert.mock.calls[0][0].update.value)).toEqual({
      modo: "item",
      itemId: "item-1",
      chamada: "Lançamento",
    });
    expect(revalidateTag).toHaveBeenCalledWith("banner:rest-a", { expire: 0 });
  });

  it("modo automático grava limpo, sem item nem chamada antigos", async () => {
    await PUT(put({ modo: "mais-vendido", itemId: "item-1", chamada: "Velha" }));
    expect(JSON.parse(upsert.mock.calls[0][0].update.value)).toEqual({
      modo: "mais-vendido",
      itemId: null,
      chamada: "",
    });
  });

  it("item de outro restaurante, ou inexistente, é recusado", async () => {
    findUnique.mockResolvedValue(null);
    const res = await PUT(put({ modo: "item", itemId: "de-outro" }));
    expect(res.status).toBe(404);
    expect(upsert).not.toHaveBeenCalled();
  });

  // O painel só lista disponíveis; a rota recusa o mesmo, para a escolha
  // gravada nunca ser um item que o banner não mostra.
  it("item indisponível é recusado", async () => {
    findUnique.mockResolvedValue({ id: "item-1", available: false });
    const res = await PUT(put({ modo: "item", itemId: "item-1" }));
    expect(res.status).toBe(409);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("modo item sem item é recusado", async () => {
    const res = await PUT(put({ modo: "item", itemId: null }));
    expect(res.status).toBe(400);
  });

  it("só admin", async () => {
    auth.mockResolvedValue({ user: { id: "c", role: "CUSTOMER", tenantId: "rest-a" } });
    const res = await PUT(put({ modo: "mais-vendido" }));
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });
});
