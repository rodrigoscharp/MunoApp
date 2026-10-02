import { describe, expect, it } from "vitest";
import { montarUrl, urlDoBancoDeTeste } from "./banco";

describe("guarda do banco de teste", () => {
  it("aceita banco local com nome de teste", () => {
    expect(urlDoBancoDeTeste({ DATABASE_URL_TESTE: montarUrl("localhost", 5433, "muno_teste", "u") })).toContain("muno_teste");
  });
  it("recusa host remoto", () => {
    expect(() =>
      urlDoBancoDeTeste({ DATABASE_URL_TESTE: montarUrl("db.exemplo.supabase.com", 6543, "postgres_test", "u") })
    ).toThrow("só rodam em banco local");
  });
  it("recusa banco local sem 'test' no nome (o de desenvolvimento)", () => {
    expect(() => urlDoBancoDeTeste({ DATABASE_URL_TESTE: montarUrl("localhost", 5433, "muno", "u") })).toThrow('"test"');
  });
  it("recusa sem a variável", () => {
    expect(() => urlDoBancoDeTeste({})).toThrow("DATABASE_URL_TESTE");
  });
});
