import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authPlatform = vi.fn();
vi.mock("@/lib/auth-platform", () => ({ authPlatform: () => authPlatform() }));

const leadFindUnique = vi.fn();
const tenantUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    lead: { findUnique: (...a: unknown[]) => leadFindUnique(...a) },
    tenant: { update: (...a: unknown[]) => tenantUpdate(...a) },
  },
}));

const { PATCH } = await import("@/app/api/platform/leads/[id]/plano/route");

function requisicao(body: unknown): NextRequest {
  return new NextRequest(
    "http://admin.localhost/api/platform/leads/lead-1/plano",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

const params = { params: Promise.resolve({ id: "lead-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  authPlatform.mockResolvedValue({ user: { id: "admin-1" } });
  leadFindUnique.mockResolvedValue({ id: "lead-1", tenantId: "tenant-1" });
  tenantUpdate.mockResolvedValue({ id: "tenant-1", plano: "MEMBRO_MESA_QR" });
});

describe("PATCH /api/platform/leads/[id]/plano", () => {
  it("atualiza o plano do tenant vinculado ao lead", async () => {
    const res = await PATCH(requisicao({ plano: "MEMBRO_MESA_QR" }), params);

    expect(res.status).toBe(200);
    expect(tenantUpdate).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      data: { plano: "MEMBRO_MESA_QR" },
    });
  });

  it("recusa sem sessão de plataforma", async () => {
    authPlatform.mockResolvedValue(null);

    const res = await PATCH(requisicao({ plano: "MEMBRO_MESA_QR" }), params);

    expect(res.status).toBe(401);
    expect(tenantUpdate).not.toHaveBeenCalled();
  });

  it("404 quando o lead não existe", async () => {
    leadFindUnique.mockResolvedValue(null);

    const res = await PATCH(requisicao({ plano: "MEMBRO_MESA_QR" }), params);

    expect(res.status).toBe(404);
    expect(tenantUpdate).not.toHaveBeenCalled();
  });

  it("409 quando o lead ainda não foi convertido", async () => {
    leadFindUnique.mockResolvedValue({ id: "lead-1", tenantId: null });

    const res = await PATCH(requisicao({ plano: "MEMBRO_MESA_QR" }), params);

    expect(res.status).toBe(409);
    expect(tenantUpdate).not.toHaveBeenCalled();
  });

  it("400 com plano inválido", async () => {
    const res = await PATCH(requisicao({ plano: "PREMIUM" }), params);

    expect(res.status).toBe(400);
    expect(tenantUpdate).not.toHaveBeenCalled();
  });
});
