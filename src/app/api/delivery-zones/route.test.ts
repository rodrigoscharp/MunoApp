import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "tenant-1";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const zoneCreate = vi.fn();
const zoneFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deliveryZone: {
      create: (...a: unknown[]) => zoneCreate(...a),
      findFirst: (...a: unknown[]) => zoneFindFirst(...a),
    },
  },
}));

import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/delivery-zones", {
    method: "POST",
    headers: { "x-tenant-id": TENANT, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { role: "ADMIN" } });
  zoneFindFirst.mockResolvedValue({ position: 3 });
  zoneCreate.mockResolvedValue({ id: "zone-nova" });
});

describe("POST /api/delivery-zones", () => {
  it("cria a zona na posição seguinte", async () => {
    const res = await POST(req({ name: "CENTRO", price: 8 }));

    expect(res.status).toBe(201);
    expect(zoneCreate).toHaveBeenCalledWith({
      data: { tenantId: TENANT, name: "CENTRO", price: 8, position: 4 },
    });
  });

  it("recusa preço que não é número", async () => {
    const res = await POST(req({ name: "CENTRO", price: "de graça" }));

    expect(res.status).toBe(400);
    expect(zoneCreate).not.toHaveBeenCalled();
  });

  it("recusa preço negativo", async () => {
    const res = await POST(req({ name: "CENTRO", price: -1 }));

    expect(res.status).toBe(400);
    expect(zoneCreate).not.toHaveBeenCalled();
  });

  it("recusa nome vazio", async () => {
    const res = await POST(req({ name: "   ", price: 8 }));

    expect(res.status).toBe(400);
    expect(zoneCreate).not.toHaveBeenCalled();
  });

  // O tenantId vem do header que o proxy injeta, nunca do corpo.
  it("ignora tenantId enviado no corpo", async () => {
    await POST(req({ name: "CENTRO", price: 8, tenantId: "outro-tenant" }));

    expect(zoneCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: TENANT }),
    });
  });
});
