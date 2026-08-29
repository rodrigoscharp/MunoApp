import { describe, it, expect } from "vitest";
import { checarSlug } from "./slug";

const livre = { tenant: async () => false, inscricao: async () => false };

describe("checarSlug", () => {
  it("recusa formato inválido antes de ir ao banco", async () => {
    let consultou = false;
    const espiao = {
      tenant: async () => { consultou = true; return false; },
      inscricao: async () => false,
    };

    expect(await checarSlug("Pizzaria do João", espiao)).toEqual({
      livre: false,
      motivo: "INVALIDO",
    });
    expect(consultou).toBe(false);
  });

  it.each(["admin", "app", "join", "www"])(
    "recusa o slug reservado %s",
    async (slug) => {
      expect(await checarSlug(slug, livre)).toEqual({
        livre: false,
        motivo: "RESERVADO",
      });
    }
  );

  // Duas fontes de unicidade: um slug pode estar preso por um restaurante que
  // já existe OU por uma inscrição que ainda não pagou.
  it("recusa slug de tenant existente", async () => {
    expect(
      await checarSlug("burguer", { ...livre, tenant: async () => true })
    ).toEqual({ livre: false, motivo: "EM_USO" });
  });

  it("recusa slug reservado por outra inscrição", async () => {
    expect(
      await checarSlug("burguer", { ...livre, inscricao: async () => true })
    ).toEqual({ livre: false, motivo: "EM_USO" });
  });

  it("aceita slug livre", async () => {
    expect(await checarSlug("pizzaria-do-joao", livre)).toEqual({ livre: true });
  });
});
