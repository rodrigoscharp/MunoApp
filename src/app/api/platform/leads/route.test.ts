import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authPlatform = vi.fn();
vi.mock("@/lib/auth-platform", () => ({ authPlatform: () => authPlatform() }));

const create = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    lead: {
      create: (...args: unknown[]) => create(...args),
    },
  },
}));

const { POST } = await import("@/app/api/platform/leads/route");

function requisicao(body: unknown): NextRequest {
  return new NextRequest("http://admin.localhost/api/platform/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authPlatform.mockResolvedValue({ user: { id: "admin-1" } });
  create.mockImplementation(async (args: { data: unknown }) => ({
    id: "lead-1",
    ...(args.data as Record<string, unknown>),
  }));
});

describe("POST /api/platform/leads", () => {
  it("grava endereco e logoUrl quando informados", async () => {
    const res = await POST(
      requisicao({
        restaurante: "Pizzaria do João",
        endereco: "Rua das Flores, 100",
        logoUrl: "https://exemplo.com/logo.png",
      })
    );

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data).toMatchObject({
      endereco: "Rua das Flores, 100",
      logoUrl: "https://exemplo.com/logo.png",
    });
  });

  it("normaliza endereco e logoUrl vazios para null, igual aos demais opcionais", async () => {
    const res = await POST(
      requisicao({ restaurante: "Pizzaria do João", endereco: "", logoUrl: "" })
    );

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data).toMatchObject({
      endereco: null,
      logoUrl: null,
    });
  });

  it("continua funcionando sem endereco/logoUrl (campos opcionais)", async () => {
    const res = await POST(requisicao({ restaurante: "Pizzaria do João" }));

    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("recusa sem sessão de plataforma", async () => {
    authPlatform.mockResolvedValue(null);

    const res = await POST(requisicao({ restaurante: "x", endereco: "y" }));

    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });
});
