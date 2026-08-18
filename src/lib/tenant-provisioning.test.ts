import { describe, expect, it, vi, beforeEach } from "vitest";

const tenantFindUnique = vi.fn();
const tenantCreate = vi.fn();
const userCreate = vi.fn();
const settingCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        tenant: {
          findUnique: (...a: unknown[]) => tenantFindUnique(...a),
          create: (...a: unknown[]) => tenantCreate(...a),
        },
        user: { create: (...a: unknown[]) => userCreate(...a) },
        setting: { create: (...a: unknown[]) => settingCreate(...a) },
      }),
  },
}));

import {
  ProvisionError,
  buildTenantBaseUrl,
  gerarSenha,
  provisionTenant,
  validateSlug,
} from "./tenant-provisioning";

describe("validateSlug", () => {
  it.each(["burger-house", "pizzaria1", "a", "x-y-z"])(
    "aceita slug válido: %s",
    (slug) => {
      expect(() => validateSlug(slug)).not.toThrow();
    }
  );

  it.each([
    ["Burger", "maiúsculas"],
    ["-comeca-com-hifen", "começa com hífen"],
    ["termina-com-hifen-", "termina com hífen"],
    ["dois--hifens", "hífens consecutivos"],
    ["com espaco", "espaço"],
    ["acentuação", "acento"],
    ["", "vazio"],
  ])("rejeita %s (%s)", (slug) => {
    expect(() => validateSlug(slug)).toThrow(ProvisionError);
  });

  it("rejeita slug reservado com o código certo", () => {
    try {
      validateSlug("admin");
      throw new Error("deveria ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(ProvisionError);
      expect((err as ProvisionError).code).toBe("SLUG_RESERVADO");
    }
  });

  // Cada um destes já é um host de verdade. Provisionar um tenant com o slug
  // devolveria a ele uma URL que a plataforma serve com outra coisa — o
  // restaurante ficaria inacessível e o cliente veria a página errada.
  it.each(["join", "www", "admin"])(
    "rejeita %s, que já é um host da plataforma",
    (slug) => {
      try {
        validateSlug(slug);
        throw new Error("deveria ter lançado");
      } catch (err) {
        expect((err as ProvisionError).code).toBe("SLUG_RESERVADO");
      }
    }
  );

  it("distingue slug inválido de slug reservado", () => {
    try {
      validateSlug("Admin");
      throw new Error("deveria ter lançado");
    } catch (err) {
      // "Admin" tem maiúscula, então falha no formato antes de chegar na
      // lista de reservados.
      expect((err as ProvisionError).code).toBe("SLUG_INVALIDO");
    }
  });
});

describe("gerarSenha", () => {
  it("gera senha com pelo menos 12 caracteres", () => {
    expect(gerarSenha().length).toBeGreaterThanOrEqual(12);
  });

  it("usa apenas caracteres seguros para URL", () => {
    for (let i = 0; i < 50; i++) {
      expect(gerarSenha()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("não repete", () => {
    const senhas = new Set(Array.from({ length: 100 }, () => gerarSenha()));
    expect(senhas.size).toBe(100);
  });
});

describe("buildTenantBaseUrl", () => {
  it("usa http em localhost", () => {
    process.env.ROOT_DOMAIN = "localhost:3000";
    expect(buildTenantBaseUrl("teste")).toBe("http://teste.localhost:3000");
  });

  it("usa o domínio nu (o último da lista), não o host de marketing", () => {
    // O primeiro item é o host institucional; pendurar o tenant nele daria
    // "teste.www.munoapp.com.br", fora do curinga *.munoapp.com.br.
    process.env.ROOT_DOMAIN = "www.munoapp.com.br,munoapp.com.br";
    expect(buildTenantBaseUrl("teste")).toBe("https://teste.munoapp.com.br");
  });

  it("funciona com ROOT_DOMAIN de entrada única", () => {
    process.env.ROOT_DOMAIN = "munoapp.com.br";
    expect(buildTenantBaseUrl("teste")).toBe("https://teste.munoapp.com.br");
  });
});

describe("provisionTenant — restaurant_info", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantFindUnique.mockResolvedValue(null);
    tenantCreate.mockImplementation(
      async (args: { data: { nome: string; slug: string } }) => ({
        id: "tenant-1",
        ...args.data,
      })
    );
    userCreate.mockImplementation(
      async (args: { data: Record<string, unknown> }) => ({
        id: "user-1",
        ...args.data,
      })
    );
    settingCreate.mockResolvedValue({});
    process.env.ROOT_DOMAIN = "munoapp.com.br";
  });

  it("cria o Setting com o nome do tenant e o resto no DEFAULT quando nada mais foi informado", async () => {
    await provisionTenant({
      nome: "Pizzaria do João",
      slug: "pizzaria-joao",
      email: "dono@exemplo.com",
    });

    expect(settingCreate).toHaveBeenCalledTimes(1);
    const { data } = settingCreate.mock.calls[0][0];
    expect(data.tenantId).toBe("tenant-1");
    expect(data.key).toBe("restaurant_info");
    expect(JSON.parse(data.value)).toEqual({
      name: "Pizzaria do João",
      address: "Rua Paraty 1772, Ubatuba-SP",
      phone: "(12) 99999-0000",
      logoUrl: "/munowbg.png",
    });
  });

  it("usa endereco/telefone/logoUrl do input quando informados", async () => {
    await provisionTenant({
      nome: "Pizzaria do João",
      slug: "pizzaria-joao",
      email: "dono@exemplo.com",
      endereco: "Rua das Flores, 100",
      telefone: "(12) 98888-7777",
      logoUrl: "https://cdn.example/logo.png",
    });

    const { data } = settingCreate.mock.calls[0][0];
    expect(JSON.parse(data.value)).toEqual({
      name: "Pizzaria do João",
      address: "Rua das Flores, 100",
      phone: "(12) 98888-7777",
      logoUrl: "https://cdn.example/logo.png",
    });
  });

  it("nasce MEMBRO quando plano não é informado", async () => {
    await provisionTenant({
      nome: "Pizzaria do João",
      slug: "pizzaria-joao",
      email: "dono@exemplo.com",
    });

    expect(tenantCreate.mock.calls[0][0].data.plano).toBe("MEMBRO");
  });

  it("respeita o plano informado", async () => {
    await provisionTenant({
      nome: "Pizzaria do João",
      slug: "pizzaria-joao",
      email: "dono@exemplo.com",
      plano: "MEMBRO_MESA_QR",
    });

    expect(tenantCreate.mock.calls[0][0].data.plano).toBe("MEMBRO_MESA_QR");
  });
});
