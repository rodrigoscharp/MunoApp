/**
 * Os pedidos abertos de uma mesa, na tela do salão.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "restaurante-a";
const MESA_ID = "mesa-1";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const orderFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findMany: (...a: unknown[]) => orderFindMany(...a) } },
}));

import { GET } from "./route";

const params = { params: Promise.resolve({ id: MESA_ID }) };

function req({
  tenant = true,
  plano = "MEMBRO_MESA_QR",
}: { tenant?: boolean; plano?: string | null } = {}) {
  return new NextRequest(`http://localhost/api/tables/${MESA_ID}/orders`, {
    headers: {
      ...(tenant ? { "x-tenant-id": TENANT } : {}),
      ...(plano ? { "x-tenant-plano": plano } : {}),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  orderFindMany.mockResolvedValue([{ id: "pedido-1", items: [] }]);
});

describe("GET /api/tables/[id]/orders", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await GET(req({ tenant: false }), params);
    expect(res.status).toBe(400);
  });

  it("recusa restaurante sem o plano de mesa QR", async () => {
    const res = await GET(req({ plano: "MEMBRO" }), params);
    expect(res.status).toBe(403);
    expect(orderFindMany).not.toHaveBeenCalled();
  });

  it("recusa quando o header de plano não veio", async () => {
    const res = await GET(req({ plano: null }), params);
    expect(res.status).toBe(403);
  });

  it("recusa visitante sem sessão", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req(), params);
    expect(res.status).toBe(403);
  });

  it.each(["CUSTOMER", "KITCHEN", "MOTOBOY"])("recusa role %s", async (role) => {
    auth.mockResolvedValue({ user: { id: "u", role } });
    const res = await GET(req(), params);
    expect(res.status).toBe(403);
    expect(orderFindMany).not.toHaveBeenCalled();
  });

  it("lista só o que está em aberto naquela mesa", async () => {
    await GET(req(), params);
    expect(orderFindMany.mock.calls[0][0].where).toEqual({
      tableId: MESA_ID,
      status: { not: "CANCELLED" },
      paymentStatus: "UNPAID",
    });
  });

  it("entrega do mais recente para o mais antigo", async () => {
    await GET(req(), params);
    expect(orderFindMany.mock.calls[0][0].orderBy).toEqual({ createdAt: "desc" });
  });

  it("devolve 500 genérico quando o banco falha", async () => {
    orderFindMany.mockRejectedValue(new Error("timeout"));
    const res = await GET(req(), params);
    expect(res.status).toBe(500);
  });
});
