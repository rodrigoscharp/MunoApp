import { describe, expect, it } from "vitest";
import {
  ProvisionError,
  buildTenantBaseUrl,
  gerarSenha,
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
