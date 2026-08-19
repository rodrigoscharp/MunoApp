import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "tenant-1";
const ZONE_ID = "zone-1";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const zoneUpdate = vi.fn();
const zoneDelete = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deliveryZone: {
      update: (...a: unknown[]) => zoneUpdate(...a),
      delete: (...a: unknown[]) => zoneDelete(...a),
    },
  },
}));

import { PATCH, DELETE } from "./route";

function req(method: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/delivery-zones/${ZONE_ID}`, {
    method,
    headers: { "x-tenant-id": TENANT, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const params = { params: Promise.resolve({ id: ZONE_ID }) };

function erroPrisma(code: string) {
  return Object.assign(new Error(code), { code });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { role: "ADMIN" } });
  zoneUpdate.mockResolvedValue({ id: ZONE_ID, name: "ITAGUA", price: 5 });
  zoneDelete.mockResolvedValue({ id: ZONE_ID });
});

describe("PATCH /api/delivery-zones/[id]", () => {
  it("atualiza nome e preço", async () => {
    const res = await PATCH(req("PATCH", { name: "ITAGUA", price: 7.5 }), params);

    expect(res.status).toBe(200);
    expect(zoneUpdate).toHaveBeenCalledWith({
      where: { id: ZONE_ID },
      data: { name: "ITAGUA", price: 7.5 },
    });
  });

  // O corpo ia cru para o `data` do Prisma. Como tenantId é campo do modelo,
  // ele era aceito e a zona mudava de restaurante.
  it("ignora tenantId enviado no corpo", async () => {
    const res = await PATCH(
      req("PATCH", { name: "ITAGUA", tenantId: "outro-tenant" }),
      params
    );

    expect(res.status).toBe(200);
    expect(zoneUpdate).toHaveBeenCalledWith({
      where: { id: ZONE_ID },
      data: { name: "ITAGUA" },
    });
  });

  it("recusa preço que não é número", async () => {
    const res = await PATCH(req("PATCH", { price: "de graça" }), params);

    expect(res.status).toBe(400);
    expect(zoneUpdate).not.toHaveBeenCalled();
  });

  it("recusa preço negativo", async () => {
    const res = await PATCH(req("PATCH", { price: -10 }), params);

    expect(res.status).toBe(400);
    expect(zoneUpdate).not.toHaveBeenCalled();
  });

  it("devolve 404 quando a zona não existe", async () => {
    zoneUpdate.mockRejectedValue(erroPrisma("P2025"));

    const res = await PATCH(req("PATCH", { name: "ITAGUA" }), params);

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/delivery-zones/[id]", () => {
  it("apaga a zona", async () => {
    const res = await DELETE(req("DELETE"), params);

    expect(res.status).toBe(200);
    expect(zoneDelete).toHaveBeenCalledWith({ where: { id: ZONE_ID } });
  });

  it("devolve 404 quando a zona não existe", async () => {
    zoneDelete.mockRejectedValue(erroPrisma("P2025"));

    const res = await DELETE(req("DELETE"), params);

    expect(res.status).toBe(404);
  });
});
