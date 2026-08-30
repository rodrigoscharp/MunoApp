import { describe, expect, it } from "vitest";
// A regra mora no script de build (CommonJS, rodado por `node` no build da
// Vercel, sem tsx no caminho) e o teste alcança de fora de src/ — mesma
// prática de plans.test.ts, que lê public/vendas/index.html, e de
// tenant-removal.test.ts, que lê o schema.prisma.
import { faltantesEmProducao } from "../../../scripts/verificar-env-producao.js";

const COMPLETO = {
  VERCEL_ENV: "production",
  ASAAS_API_KEY: "$aact_prod_abc",
  ASAAS_ENV: "production",
  ASAAS_WEBHOOK_TOKEN: "token",
};

describe("variáveis do Asaas exigidas no deploy de produção", () => {
  it("acusa a ASAAS_API_KEY ausente", () => {
    const { ASAAS_API_KEY: _, ...semChave } = COMPLETO;

    expect(faltantesEmProducao(semChave)).toEqual(["ASAAS_API_KEY"]);
  });

  it("não acusa nada quando todas estão presentes", () => {
    expect(faltantesEmProducao(COMPLETO)).toEqual([]);
  });

  it("trata string vazia como ausente", () => {
    // `vercel env add` com valor em branco grava "" — presente para o
    // `in`, inútil para o Asaas. Sem isto a guarda passaria batido no
    // caso que ela existe para pegar.
    expect(faltantesEmProducao({ ...COMPLETO, ASAAS_API_KEY: "  " })).toEqual([
      "ASAAS_API_KEY",
    ]);
  });

  it("acusa todas as que faltam de uma vez", () => {
    // Uma por deploy quebrado seria três builds até descobrir a terceira.
    expect(faltantesEmProducao({ VERCEL_ENV: "production" })).toEqual([
      "ASAAS_API_KEY",
      "ASAAS_ENV",
      "ASAAS_WEBHOOK_TOKEN",
    ]);
  });

  it("não exige nada fora do deploy de produção", () => {
    // Preview e build local não têm as chaves de produção e não devem ter:
    // exigi-las aqui quebraria todo PR. É a mesma condição por VERCEL_ENV
    // que migrate-on-deploy.js usa para não migrar em preview.
    expect(faltantesEmProducao({ VERCEL_ENV: "preview" })).toEqual([]);
    expect(faltantesEmProducao({})).toEqual([]);
  });
});
