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
const settingUpsert = vi.fn();
const tenantFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    setting: {
      findUnique: (...a: unknown[]) => settingFindUnique(...a),
      upsert: (...a: unknown[]) => settingUpsert(...a),
    },
    tenant: { findUnique: (...a: unknown[]) => tenantFindUnique(...a) },
  },
}));

// unstable_cache é transparente aqui: o teste quer a leitura, não o cache.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  revalidateTag: vi.fn(),
}));

import { GET, PUT } from "./route";

function req() {
  return new NextRequest("http://localhost/api/settings/restaurant", {
    headers: { "x-tenant-id": TENANT },
  });
}

function putReq(body: unknown) {
  return new NextRequest("http://localhost/api/settings/restaurant", {
    method: "PUT",
    headers: { "x-tenant-id": TENANT, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const CADASTRO_COMPLETO = {
  name: "Pizzaria do Bairro",
  address: "Rua das Flores, 100",
  phone: "(12) 99999-0000",
  logoUrl: "/logo.png",
  floorPlanImageUrl: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  tenantFindUnique.mockResolvedValue({ nome: "Pizzaria do Bairro" });
  auth.mockResolvedValue({ user: { role: "ADMIN" } });
  settingUpsert.mockResolvedValue({});
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

/**
 * O PUT gravava `JSON.stringify(body)` sem validar nada. Um corpo vazio não era
 * recusado: virava o novo cadastro, e nome, endereço, telefone e logo sumiam do
 * cabeçalho, do rodapé e do cardápio público — sem erro e sem cópia anterior.
 */
describe("PUT /api/settings/restaurant", () => {
  it("grava o cadastro completo", async () => {
    const res = await PUT(putReq(CADASTRO_COMPLETO));

    expect(res.status).toBe(200);
    expect(settingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { value: JSON.stringify(CADASTRO_COMPLETO) },
      })
    );
  });

  it("recusa corpo vazio em vez de apagar o cadastro", async () => {
    const res = await PUT(putReq({}));

    expect(res.status).toBe(400);
    expect(settingUpsert).not.toHaveBeenCalled();
  });

  it("recusa nome em branco", async () => {
    const res = await PUT(putReq({ ...CADASTRO_COMPLETO, name: "   " }));

    expect(res.status).toBe(400);
    expect(settingUpsert).not.toHaveBeenCalled();
  });

  it("recusa campo com tipo errado", async () => {
    const res = await PUT(putReq({ ...CADASTRO_COMPLETO, phone: 11999998888 }));

    expect(res.status).toBe(400);
    expect(settingUpsert).not.toHaveBeenCalled();
  });

  it("não grava campo estranho vindo do corpo", async () => {
    await PUT(putReq({ ...CADASTRO_COMPLETO, tenantId: "outro-tenant" }));

    const gravado = JSON.parse(settingUpsert.mock.calls[0][0].update.value);
    expect(gravado).not.toHaveProperty("tenantId");
  });
});
