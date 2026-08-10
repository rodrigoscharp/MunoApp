import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TENANT_SCOPED_MODELS } from "./tenant-scoped-models";

/**
 * O bug que originou este teste: OrderItem e DeliveryTracking não tinham
 * tenantId, ficavam fora de TENANT_SCOPED_MODELS e, por isso, fora do filtro
 * automático — o groupBy do "Top 10 itens" em /api/analytics somava os itens de
 * todos os restaurantes. Com um único tenant no banco isso é indistinguível do
 * resultado correto, então nenhum teste de comportamento pegaria.
 *
 * A defesa não é testar aquele endpoint: é garantir que a lista nunca fique
 * atrás do schema. Todo model que ganhar tenantId daqui pra frente tem que ser
 * registrado, senão este teste quebra.
 */
/**
 * Só conta `tenantId` obrigatório. `tenantId String?` é outra coisa: em Lead ele
 * é o ponteiro opcional para o tenant criado na conversão do lead, não posse —
 * Lead é model de plataforma, lido cross-tenant com prismaUnscoped. Escopá-lo
 * esconderia todos os leads do console.
 */
function modelsComTenantIdObrigatorio(): string[] {
  const schema = readFileSync(
    join(process.cwd(), "prisma", "schema.prisma"),
    "utf8"
  );

  const modelos: string[] = [];
  // Casa `model Nome {` … `}` no primeiro fecha-chave em coluna zero, que é como
  // o prisma format sempre escreve.
  const blocos = schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm);

  for (const [, nome, corpo] of blocos) {
    if (/^\s*tenantId\s+String(?!\?)/m.test(corpo)) modelos.push(nome);
  }
  return modelos;
}

/**
 * A exceção à regra acima: model de plataforma cujo tenantId é obrigatório.
 *
 * Assinatura aponta para o restaurante, mas não é dado dele — é o contrato
 * comercial entre a plataforma e ele, lido no console por prismaUnscoped, como
 * o Lead. Escopá-la ligaria o filtro automático numa tabela que nenhum
 * restaurante consulta, e o console passaria a enxergar só a assinatura do
 * tenant da requisição, que no console não existe.
 *
 * Toda entrada aqui é um model fora do filtro automático, então a lista se
 * paga em revisão: só entra o que a plataforma lê e o restaurante não.
 */
const MODELS_DA_PLATAFORMA = new Set(["Assinatura"]);

describe("TENANT_SCOPED_MODELS", () => {
  it("cobre todo model do schema que tem coluna tenantId", () => {
    const doSchema = modelsComTenantIdObrigatorio();

    // Sanidade: se a regex parar de casar, o teste passaria vazio e não
    // protegeria nada.
    expect(doSchema.length).toBeGreaterThan(10);

    const faltando = doSchema.filter(
      (m) => !TENANT_SCOPED_MODELS.has(m) && !MODELS_DA_PLATAFORMA.has(m)
    );
    expect(faltando).toEqual([]);
  });

  it("só isenta model de plataforma que ainda existe no schema", () => {
    const doSchema = new Set(modelsComTenantIdObrigatorio());
    const fantasmas = [...MODELS_DA_PLATAFORMA].filter((m) => !doSchema.has(m));
    expect(fantasmas).toEqual([]);
  });

  it("não lista model que não existe mais ou que não tem tenantId", () => {
    const doSchema = new Set(modelsComTenantIdObrigatorio());
    const sobrando = [...TENANT_SCOPED_MODELS].filter((m) => !doSchema.has(m));
    expect(sobrando).toEqual([]);
  });

  it("inclui OrderItem e DeliveryTracking", () => {
    expect(TENANT_SCOPED_MODELS.has("OrderItem")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("DeliveryTracking")).toBe(true);
  });

  it("não escopa models de plataforma, que são cross-tenant por natureza", () => {
    expect(TENANT_SCOPED_MODELS.has("Tenant")).toBe(false);
    expect(TENANT_SCOPED_MODELS.has("PlatformAdmin")).toBe(false);
    expect(TENANT_SCOPED_MODELS.has("Assinatura")).toBe(false);
    expect(TENANT_SCOPED_MODELS.has("Cobranca")).toBe(false);
  });

  it("deixa Lead de fora mesmo tendo tenantId, porque o dele é opcional", () => {
    expect(modelsComTenantIdObrigatorio()).not.toContain("Lead");
    expect(TENANT_SCOPED_MODELS.has("Lead")).toBe(false);
  });
});
