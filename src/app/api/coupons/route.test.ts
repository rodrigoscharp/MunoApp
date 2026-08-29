/**
 * Cupons do restaurante.
 *
 * A listagem é a lista de códigos válidos — exatamente o que alguém raspa e sai
 * usando se a rota ficar aberta. Por isso GET também é só de admin, o que é
 * incomum no resto do app e fácil de "simplificar" por engano depois.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "restaurante-a";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const couponFindMany = vi.fn();
const couponCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    coupon: {
      findMany: (...a: unknown[]) => couponFindMany(...a),
      create: (...a: unknown[]) => couponCreate(...a),
    },
  },
}));

import { GET, POST } from "./route";

function req(method: string, body?: Record<string, unknown>, comTenant = true) {
  return new NextRequest("http://localhost/api/coupons", {
    method,
    headers: {
      ...(comTenant ? { "x-tenant-id": TENANT } : {}),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const cupomValido = {
  code: "promo10",
  type: "FIXED",
  value: 10,
  minOrder: 50,
  active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  couponFindMany.mockResolvedValue([{ id: "cupom-1", code: "PROMO10" }]);
  couponCreate.mockResolvedValue({ id: "cupom-novo", code: "PROMO10" });
});

describe("a lista de cupons é só do admin", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await GET(req("GET", undefined, false));
    expect(res.status).toBe(400);
  });

  it("recusa visitante sem sessão", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req("GET"));

    expect(res.status).toBe(403);
    expect(couponFindMany).not.toHaveBeenCalled();
  });

  it.each(["CUSTOMER", "KITCHEN", "MOTOBOY"])("recusa role %s", async (role) => {
    auth.mockResolvedValue({ user: { id: "u", role } });
    const res = await GET(req("GET"));

    expect(res.status).toBe(403);
    expect(couponFindMany).not.toHaveBeenCalled();
  });

  it("traz a contagem de usos junto", async () => {
    await GET(req("GET"));
    expect(couponFindMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { orders: true } } },
    });
  });
});

describe("POST — autorização e corpo", () => {
  it.each(["CUSTOMER", "KITCHEN", "MOTOBOY"])("recusa role %s", async (role) => {
    auth.mockResolvedValue({ user: { id: "u", role } });
    const res = await POST(req("POST", cupomValido));

    expect(res.status).toBe(403);
    expect(couponCreate).not.toHaveBeenCalled();
  });

  it("recusa corpo sem código", async () => {
    const { code: _, ...semCodigo } = cupomValido;
    const res = await POST(req("POST", semCodigo));

    expect(res.status).toBe(400);
    expect(couponCreate).not.toHaveBeenCalled();
  });

  it("recusa tipo de cupom que não existe", async () => {
    const res = await POST(req("POST", { ...cupomValido, type: "BRINDE" }));
    expect(res.status).toBe(400);
  });
});

describe("POST — o cupom criado", () => {
  it("normaliza o código antes de gravar", async () => {
    await POST(req("POST", { ...cupomValido, code: "  promo10 " }));
    expect(couponCreate.mock.calls[0][0].data.code).toBe("PROMO10");
  });

  it("nasce preso ao tenant da request", async () => {
    await POST(req("POST", { ...cupomValido, tenantId: "restaurante-b" }));
    expect(couponCreate.mock.calls[0][0].data.tenantId).toBe(TENANT);
  });

  it("responde 201 com contagem de usos zerada", async () => {
    const res = await POST(req("POST", cupomValido));

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ _count: { orders: 0 } });
  });

  it("responde 409 quando o código já existe", async () => {
    couponCreate.mockRejectedValue({ code: "P2002" });
    const res = await POST(req("POST", cupomValido));

    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).toContain("Já existe um cupom");
  });

  it("erro desconhecido continua sendo 500", async () => {
    couponCreate.mockRejectedValue(new Error("connection terminated"));
    const res = await POST(req("POST", cupomValido));
    expect(res.status).toBe(500);
  });
});
