import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authPlatform = vi.fn();
vi.mock("@/lib/auth-platform", () => ({ authPlatform: () => authPlatform() }));

const provisionTenant = vi.fn();
vi.mock("@/lib/tenant-provisioning", () => ({
  ProvisionError: class ProvisionError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  provisionTenant: (...args: unknown[]) => provisionTenant(...args),
}));

const leadFindUnique = vi.fn();
const leadUpdateMany = vi.fn();
const assinaturaCreate = vi.fn();
const assinaturaDeleteMany = vi.fn();
const settingDeleteMany = vi.fn();
const userDeleteMany = vi.fn();
const tenantDelete = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    lead: {
      findUnique: (...a: unknown[]) => leadFindUnique(...a),
      updateMany: (...a: unknown[]) => leadUpdateMany(...a),
    },
    assinatura: {
      create: (...a: unknown[]) => assinaturaCreate(...a),
      deleteMany: (...a: unknown[]) => assinaturaDeleteMany(...a),
    },
    setting: { deleteMany: (...a: unknown[]) => settingDeleteMany(...a) },
    user: { deleteMany: (...a: unknown[]) => userDeleteMany(...a) },
    tenant: { delete: (...a: unknown[]) => tenantDelete(...a) },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

const { POST } = await import("@/app/api/platform/leads/[id]/converter/route");

function requisicao(body: unknown): NextRequest {
  return new NextRequest(
    "http://admin.localhost/api/platform/leads/lead-1/converter",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

const params = { params: Promise.resolve({ id: "lead-1" }) };

const LEAD_BASE = {
  id: "lead-1",
  restaurante: "Pizzaria do João",
  tenantId: null,
  endereco: null,
  telefone: null,
  logoUrl: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  authPlatform.mockResolvedValue({ user: { id: "admin-1" } });
  leadFindUnique.mockResolvedValue(LEAD_BASE);
  provisionTenant.mockResolvedValue({
    tenant: { id: "tenant-1", nome: "Pizzaria do João", slug: "pizzaria-joao" },
    admin: { email: "dono@exemplo.com" },
    url: "https://pizzaria-joao.munoapp.com.br",
    senha: "senha-gerada",
  });
  leadUpdateMany.mockResolvedValue({ count: 1 });
  assinaturaDeleteMany.mockResolvedValue({ count: 0 });
  settingDeleteMany.mockResolvedValue({ count: 0 });
  userDeleteMany.mockResolvedValue({ count: 0 });
  tenantDelete.mockResolvedValue({});
});

describe("POST /api/platform/leads/[id]/converter", () => {
  it("passa endereco, telefone e logoUrl do lead para provisionTenant", async () => {
    leadFindUnique.mockResolvedValue({
      ...LEAD_BASE,
      endereco: "Rua das Flores, 100",
      telefone: "(12) 98888-7777",
      logoUrl: "https://cdn.example/logo.png",
    });

    await POST(
      requisicao({ slug: "pizzaria-joao", email: "dono@exemplo.com" }),
      params
    );

    expect(provisionTenant).toHaveBeenCalledWith({
      nome: "Pizzaria do João",
      slug: "pizzaria-joao",
      email: "dono@exemplo.com",
      endereco: "Rua das Flores, 100",
      telefone: "(12) 98888-7777",
      logoUrl: "https://cdn.example/logo.png",
    });
  });

  it("usa undefined, não null, quando o lead não tem esses campos", async () => {
    await POST(
      requisicao({ slug: "pizzaria-joao", email: "dono@exemplo.com" }),
      params
    );

    expect(provisionTenant).toHaveBeenCalledWith({
      nome: "Pizzaria do João",
      slug: "pizzaria-joao",
      email: "dono@exemplo.com",
      endereco: undefined,
      telefone: undefined,
      logoUrl: undefined,
    });
  });

  it("corrida perdida: desfaz o setting junto com assinatura e user antes de apagar o tenant", async () => {
    leadUpdateMany.mockResolvedValue({ count: 0 });

    const res = await POST(
      requisicao({ slug: "pizzaria-joao", email: "dono@exemplo.com" }),
      params
    );

    expect(res.status).toBe(409);
    expect(settingDeleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1" },
    });
    expect(tenantDelete).toHaveBeenCalledWith({ where: { id: "tenant-1" } });
  });

  it("recusa sem sessão de plataforma", async () => {
    authPlatform.mockResolvedValue(null);

    const res = await POST(
      requisicao({ slug: "x", email: "a@b.com" }),
      params
    );

    expect(res.status).toBe(401);
    expect(provisionTenant).not.toHaveBeenCalled();
  });
});
