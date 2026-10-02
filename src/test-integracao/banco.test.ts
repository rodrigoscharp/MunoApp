import { describe, expect, it } from "vitest";
import { urlDoBancoDeTeste } from "./banco";

describe("guarda do banco de teste", () => {
  it("aceita banco local com nome de teste", () => {
    expect(urlDoBancoDeTeste({ DATABASE_URL_TESTE: "postgresql://localhost:5433/muno_teste" })).toContain("muno_teste");
  });
  it("recusa host remoto", () => {
    expect(() =>
      urlDoBancoDeTeste({ DATABASE_URL_TESTE: "postgresql://aws-1-us-east-1.pooler.supabase.com:6543/postgres_test" })
    ).toThrow("só rodam em banco local");
  });
  it("recusa banco local sem 'test' no nome (o de desenvolvimento)", () => {
    expect(() => urlDoBancoDeTeste({ DATABASE_URL_TESTE: "postgresql://localhost:5433/muno" })).toThrow('"test"');
  });
  it("recusa sem a variável", () => {
    expect(() => urlDoBancoDeTeste({})).toThrow("DATABASE_URL_TESTE");
  });
});
