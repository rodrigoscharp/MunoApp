import { describe, expect, it } from "vitest";
import { sessaoValida } from "./cookie";

describe("sessaoValida", () => {
  it("aceita um uuid v4, no formato que o proxy emite", () => {
    expect(sessaoValida("3fa85f64-5717-4562-b3fc-2c963f66afa6")).toBe(true);
  });

  it("aceita maiúsculas também", () => {
    expect(sessaoValida("3FA85F64-5717-4562-B3FC-2C963F66AFA6")).toBe(true);
  });

  it("recusa cookie ausente", () => {
    expect(sessaoValida(undefined)).toBe(false);
  });

  it("recusa string vazia", () => {
    expect(sessaoValida("")).toBe(false);
  });

  // O cookie é controlado pelo cliente, e vira chave primária de SessaoFunil
  // sem passar por lugar nenhum. Qualquer forma fora do que o proxy emite
  // precisa ser recusada, não só as óbvias.
  it("recusa qualquer coisa que não seja um uuid v4", () => {
    expect(sessaoValida("qualquer-coisa")).toBe(false);
    expect(sessaoValida("1; DROP TABLE SessaoFunil;")).toBe(false);
    expect(sessaoValida("a".repeat(500))).toBe(false);
    expect(sessaoValida("3fa85f64571745623fc2c963f66afa6")).toBe(false); // sem hífens
  });
});
