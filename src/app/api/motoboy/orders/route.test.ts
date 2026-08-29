/**
 * A fila de corridas disponíveis para o motoboy.
 *
 * O `where` é o contrato: pronto, de entrega, e ainda sem dono. Frouxar
 * qualquer uma das três põe na fila corrida que já saiu ou pedido de balcão.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "restaurante-a";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const orderFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findMany: (...a: unknown[]) => orderFindMany(...a) } },
}));

import { GET } from "./route";

function req(comTenant = true) {
  return new NextRequest("http://localhost/api/motoboy/orders", {
    headers: comTenant ? { "x-tenant-id": TENANT } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "motoboy-1", role: "MOTOBOY" } });
  orderFindMany.mockResolvedValue([{ id: "pedido-1", items: [] }]);
});

describe("GET /api/motoboy/orders", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await GET(req(false));
    expect(res.status).toBe(400);
    expect(orderFindMany).not.toHaveBeenCalled();
  });

  it("recusa visitante sem sessão", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(orderFindMany).not.toHaveBeenCalled();
  });

  it.each(["CUSTOMER", "KITCHEN"])("recusa role %s", async (role) => {
    auth.mockResolvedValue({ user: { id: "u", role } });
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it.each(["MOTOBOY", "ADMIN"])("aceita role %s", async (role) => {
    auth.mockResolvedValue({ user: { id: "u", role } });
    const res = await GET(req());
    expect(res.status).toBe(200);
  });

  it("lista só corrida pronta, de entrega e sem dono", async () => {
    await GET(req());
    expect(orderFindMany.mock.calls[0][0].where).toEqual({
      status: "READY",
      deliveryType: "DELIVERY",
      motoboyId: null,
    });
  });

  it("entrega a fila do mais antigo para o mais novo", async () => {
    await GET(req());
    expect(orderFindMany.mock.calls[0][0].orderBy).toEqual({ createdAt: "asc" });
  });

  it("traz o nome dos itens, que é o que o motoboy confere na sacola", async () => {
    await GET(req());
    expect(orderFindMany.mock.calls[0][0].include.items.include.menuItem).toEqual({
      select: { name: true },
    });
  });

  it("devolve 500 genérico quando o banco falha", async () => {
    orderFindMany.mockRejectedValue(new Error("timeout"));
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});
