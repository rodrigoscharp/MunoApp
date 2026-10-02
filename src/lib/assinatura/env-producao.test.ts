import { describe, expect, it } from "vitest";
// A regra mora no script de build (CommonJS, rodado por `node` no build da
// Vercel, sem tsx no caminho) e o teste alcança de fora de src/ — mesma
// prática de plans.test.ts, que lê public/vendas/index.html, e de
// tenant-removal.test.ts, que lê o schema.prisma.
import {
  faltantesEmProducao,
  documentosLegaisPendentes,
  recomendadasAusentes,
} from "../../../scripts/verificar-env-producao.js";

const COMPLETO = {
  VERCEL_ENV: "production",
  ASAAS_API_KEY: "$aact_prod_abc",
  ASAAS_ENV: "production",
  ASAAS_WEBHOOK_TOKEN: "token",
  RESEND_API_KEY: "re_xxx",
  RESEND_FROM_EMAIL: "Muno <contato@munoapp.com.br>",
  PAYMENT_TOKEN_ENCRYPTION_KEY: "a".repeat(64),
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
    // Uma por deploy quebrado seria dois builds até descobrir a segunda.
    expect(
      faltantesEmProducao({
        VERCEL_ENV: "production",
        ASAAS_ENV: "production",
      })
    ).toEqual([
      "ASAAS_API_KEY",
      "ASAAS_WEBHOOK_TOKEN",
      "RESEND_API_KEY",
      "RESEND_FROM_EMAIL",
      "PAYMENT_TOKEN_ENCRYPTION_KEY",
    ]);
  });

  it("não exige nada enquanto o Asaas não estiver declarado em produção", () => {
    // ASAAS_ENV é o interruptor: ele é a declaração de que a plataforma
    // passou a cobrar de verdade. Enquanto não estiver ligado, produção está
    // assumidamente em sandbox e não faz sentido exigir credencial de
    // produção — exigir travaria o deploy de correções sem nenhuma relação
    // com assinatura.
    expect(faltantesEmProducao({ VERCEL_ENV: "production" })).toEqual([]);
    expect(
      faltantesEmProducao({ VERCEL_ENV: "production", ASAAS_ENV: "sandbox" })
    ).toEqual([]);
  });

  it("não exige nada fora do deploy de produção", () => {
    // Preview e build local não têm as chaves de produção e não devem ter:
    // exigi-las aqui quebraria todo PR. É a mesma condição por VERCEL_ENV
    // que migrate-on-deploy.js usa para não migrar em preview.
    expect(faltantesEmProducao({ VERCEL_ENV: "preview" })).toEqual([]);
    expect(faltantesEmProducao({})).toEqual([]);
  });
});

describe("documentos legais antes do deploy de produção", () => {
  const PRODUCAO = { VERCEL_ENV: "production" };

  it("barra quando o documento ainda tem campo por preencher", () => {
    const pendentes = documentosLegaisPendentes(PRODUCAO, (arquivo) =>
      arquivo.endsWith("termos.html") ? "<p>CNPJ <mark>[CNPJ]</mark></p>" : "<p>pronto</p>"
    );
    expect(pendentes).toEqual(["public/vendas/termos.html"]);
  });

  it("passa quando os dois estão preenchidos", () => {
    expect(documentosLegaisPendentes(PRODUCAO, () => "<p>pronto</p>")).toEqual([]);
  });

  it("barra se o documento sumiu, porque o checkout aponta para ele", () => {
    const pendentes = documentosLegaisPendentes(PRODUCAO, () => {
      throw new Error("ENOENT");
    });
    expect(pendentes).toHaveLength(2);
  });

  it("não barra preview nem build local", () => {
    expect(documentosLegaisPendentes({ VERCEL_ENV: "preview" }, () => "<mark>x</mark>")).toEqual([]);
    expect(documentosLegaisPendentes({}, () => "<mark>x</mark>")).toEqual([]);
  });
});

describe("e-mail do acesso: sem Resend o cliente que pagou não entra", () => {
  it.each(["RESEND_API_KEY", "RESEND_FROM_EMAIL"])("acusa %s ausente", (nome) => {
    const { [nome]: _, ...sem } = COMPLETO as Record<string, string>;
    expect(faltantesEmProducao(sem)).toEqual([nome]);
  });
});

describe("variáveis recomendadas em produção", () => {
  it("lista as ausentes, só em produção", () => {
    expect(recomendadasAusentes({ VERCEL_ENV: "production" })).toContain("ERROR_WEBHOOK_URL");
    expect(recomendadasAusentes({ VERCEL_ENV: "preview" })).toEqual([]);
  });

  it("não lista as presentes", () => {
    const ausentes = recomendadasAusentes({
      VERCEL_ENV: "production",
      ERROR_WEBHOOK_URL: "https://hooks.example/abc",
    });
    expect(ausentes).not.toContain("ERROR_WEBHOOK_URL");
  });
});
