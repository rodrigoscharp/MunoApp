import { describe, expect, it } from "vitest";
import { hrefDoFiltro, lerFiltros } from "./filtros";

describe("lerFiltros", () => {
  it("padrão: só avisos e erros, sem peça, sem restaurante", () => {
    expect(lerFiltros({})).toEqual({ todos: false, peca: null, tenantId: null });
  });
  it("lê os três", () => {
    expect(lerFiltros({ todos: "1", peca: "email", tenant: "t1" })).toEqual({ todos: true, peca: "email", tenantId: "t1" });
  });
  it("peça desconhecida é ignorada", () => {
    expect(lerFiltros({ peca: "<script>" }).peca).toBeNull();
  });
  it("aceita outros", () => {
    expect(lerFiltros({ peca: "outros" }).peca).toBe("outros");
  });
  it("valor repetido na URL usa o primeiro", () => {
    expect(lerFiltros({ peca: ["cron", "email"] }).peca).toBe("cron");
  });
});

describe("hrefDoFiltro", () => {
  const base = { todos: false, peca: null, tenantId: null };
  it("sem filtro volta para /saude", () => {
    expect(hrefDoFiltro(base, {})).toBe("/saude");
  });
  it("combina a mudança com o atual", () => {
    expect(hrefDoFiltro({ ...base, peca: "cron" }, { todos: true })).toBe("/saude?todos=1&peca=cron");
  });
  it("limpa um campo com null", () => {
    expect(hrefDoFiltro({ ...base, tenantId: "t1" }, { tenantId: null })).toBe("/saude");
  });
});
