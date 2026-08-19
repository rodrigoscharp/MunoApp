import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "tenant-1";

/**
 * Regressão do cadastro do restaurante.
 *
 * Até 18/08/2026 o fallback desta rota era o restaurante do seed — nome "Muno
 * Food Restaurante", "Rua Paraty 1772, Ubatuba-SP" e um telefone real. Todo
 * tenant sem Setting salvo (ou com o JSON corrompido) publicava o endereço e o
 * telefone de outro negócio no próprio cardápio. Estes testes fixam o contrato
 * novo: o nome cai para o `nome` do Tenant, e contato ausente é ausente.
 */

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const settingFindUnique = vi.fn();
const tenantFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    setting: { findUnique: (...a: unknown[]) => settingFindUnique(...a) },
    tenant: { findUnique: (...a: unknown[]) => tenantFindUnique(...a) },
  },
}));

// unstable_cache é transparente aqui: o teste quer a leitura, não o cache.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  revalidateTag: vi.fn(),
}));

import { GET } from "./route";

function req() {
  return new NextRequest("http://localhost/api/settings/restaurant", {
    headers: { "x-tenant-id": TENANT },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  tenantFindUnique.mockResolvedValue({ nome: "Pizzaria do Bairro" });
});

describe("GET /api/settings/restaurant", () => {
  it("usa o nome do próprio tenant quando não há Setting salvo", async () => {
    settingFindUnique.mockResolvedValue(null);

    const res = await GET(req());

    await expect(res.json()).resolves.toMatchObject({
      name: "Pizzaria do Bairro",
      logoUrl: "/munowbg.png",
      floorPlanImageUrl: null,
    });
  });

  it("não inventa endereço nem telefone para tenant sem cadastro", async () => {
    settingFindUnique.mockResolvedValue(null);

    const body = await (await GET(req())).json();

    // O ponto do bug: aqui vinham os dados do restaurante do seed.
    expect(body.address).toBe("");
    expect(body.phone).toBe("");
  });

  it("preenche os campos ausentes de um Setting salvo parcial", async () => {
    settingFindUnique.mockResolvedValue({
      value: JSON.stringify({ floorPlanImageUrl: "https://cdn/planta.png" }),
    });

    await expect((await GET(req())).json()).resolves.toMatchObject({
      name: "Pizzaria do Bairro",
      logoUrl: "/munowbg.png",
      floorPlanImageUrl: "https://cdn/planta.png",
    });
  });

  it("cai para o cadastro vazio quando o JSON salvo está corrompido", async () => {
    settingFindUnique.mockResolvedValue({ value: "{ nao é json" });

    const body = await (await GET(req())).json();

    expect(body).toMatchObject({ name: "Pizzaria do Bairro", address: "", phone: "" });
  });
});
