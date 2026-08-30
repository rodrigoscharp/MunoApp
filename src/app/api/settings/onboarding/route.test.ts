import { describe, expect, it, vi, beforeEach } from "vitest";

const upsert = vi.fn();
const auth = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { setting: { upsert: (...a: unknown[]) => upsert(...a) } },
}));
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));
vi.mock("@/lib/api", () => ({
  apiError: (m: string, s: number) =>
    new Response(JSON.stringify({ error: m }), { status: s }),
  getTenantIdFromRequest: () => "tenant-1",
  withTenant: (_id: string, fn: () => unknown) => fn(),
}));

function requisicao() {
  return new Request("http://x/api/settings/onboarding", { method: "POST" });
}

beforeEach(() => {
  upsert.mockReset();
  auth.mockReset();
});

describe("POST /api/settings/onboarding", () => {
  it("grava a dispensa para o tenant", async () => {
    auth.mockResolvedValue({ user: { role: "ADMIN" } });
    const { POST } = await import("./route");

    const res = await POST(requisicao() as never);

    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_key: { tenantId: "tenant-1", key: "onboarding_dispensado" },
        },
      })
    );
  });

  // A rota escreve configuração do restaurante. Sem a checagem de papel, um
  // CUSTOMER logado — e qualquer visitante pode virar um pelo "Cadastre-se
  // grátis" — desligaria o onboarding do dono.
  it("recusa quem não é ADMIN", async () => {
    auth.mockResolvedValue({ user: { role: "CUSTOMER" } });
    const { POST } = await import("./route");

    const res = await POST(requisicao() as never);

    expect(res.status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("recusa quem não está logado", async () => {
    auth.mockResolvedValue(null);
    const { POST } = await import("./route");

    const res = await POST(requisicao() as never);

    expect(res.status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });
});
