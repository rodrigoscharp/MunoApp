import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TENANT_SCOPED_MODELS } from "./tenant-scoped-models";

// --- mocks -----------------------------------------------------------------

const chamadas: { modelo: string; operacao: string; args: unknown }[] = [];

function delegateFalso(modelo: string) {
  return {
    deleteMany: (args: unknown) => {
      chamadas.push({ modelo, operacao: "deleteMany", args });
      return Promise.resolve({ count: 0 });
    },
    count: (args: unknown) => {
      chamadas.push({ modelo, operacao: "count", args });
      return Promise.resolve(0);
    },
    updateMany: (args: unknown) => {
      chamadas.push({ modelo, operacao: "updateMany", args });
      return Promise.resolve({ count: 0 });
    },
    delete: (args: unknown) => {
      chamadas.push({ modelo, operacao: "delete", args });
      return Promise.resolve({});
    },
  };
}

const findUniqueTenant = vi.fn();

// Um Proxy responde por qualquer model que o código pedir: assim o teste não
// precisa ser atualizado quando um model novo entra na ordem de exclusão — é o
// próprio teste de cobertura abaixo que cobra isso.
const clienteFalso = new Proxy({} as Record<string, unknown>, {
  get(_alvo, prop: string) {
    if (prop === "$transaction") {
      return (fn: (tx: unknown) => Promise<unknown>) => fn(clienteFalso);
    }
    if (prop === "tenant") {
      return {
        ...delegateFalso("tenant"),
        findUnique: (args: unknown) => findUniqueTenant(args),
      };
    }
    return delegateFalso(prop);
  },
});

vi.mock("@/lib/prisma", () => ({ prismaUnscoped: clienteFalso }));

const { ORDEM_DE_EXCLUSAO, RemocaoError, removeTenant } = await import(
  "./tenant-removal"
);

// --- helpers ---------------------------------------------------------------

function blocosDoSchema(): Map<string, string> {
  const schema = readFileSync(
    join(process.cwd(), "prisma", "schema.prisma"),
    "utf8"
  );
  const blocos = new Map<string, string>();
  for (const [, nome, corpo] of schema.matchAll(
    /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm
  )) {
    blocos.set(nome, corpo);
  }
  return blocos;
}

/** Models que `modelo` referencia por foreign key, exceto Tenant. */
function referenciasDe(corpo: string): string[] {
  const alvos: string[] = [];
  for (const [, tipo] of corpo.matchAll(
    /^\s*\w+\s+(\w+)\??\s+@relation\([^)]*fields:/gm
  )) {
    if (tipo !== "Tenant") alvos.push(tipo);
  }
  return alvos;
}

const TENANT = { id: "tenant-1", slug: "cantina-teste", nome: "Cantina Teste" };

beforeEach(() => {
  chamadas.length = 0;
  findUniqueTenant.mockReset();
  findUniqueTenant.mockResolvedValue(TENANT);
});

// --- testes ----------------------------------------------------------------

/**
 * O risco que estes dois primeiros testes cobrem: nenhuma relação com Tenant
 * tem `onDelete` no schema, então apagar um tenant é apagar model por model, na
 * mão, na ordem certa. Um model novo com tenantId que não entre em
 * ORDEM_DE_EXCLUSAO não quebra teste nenhum de comportamento — só falha na hora
 * da remoção, com foreign key violation e a transação já no meio.
 */
describe("ORDEM_DE_EXCLUSAO", () => {
  it("cobre exatamente os models escopados por tenant", () => {
    expect([...ORDEM_DE_EXCLUSAO].sort()).toEqual(
      [...TENANT_SCOPED_MODELS].sort()
    );
  });

  it("põe todo model antes daquele que ele referencia por foreign key", () => {
    const blocos = blocosDoSchema();
    const posicao = new Map(ORDEM_DE_EXCLUSAO.map((m, i) => [m as string, i]));

    // Sanidade: se a regex de relações parar de casar, o laço roda vazio e o
    // teste passaria sem verificar nada.
    let conferidas = 0;

    for (const modelo of ORDEM_DE_EXCLUSAO) {
      const corpo = blocos.get(modelo);
      expect(corpo, `model ${modelo} não existe no schema`).toBeDefined();

      for (const alvo of referenciasDe(corpo!)) {
        if (!posicao.has(alvo)) continue; // fora do escopo de tenant
        conferidas++;
        expect(
          posicao.get(modelo)!,
          `${modelo} referencia ${alvo} e precisa ser apagado antes dele`
        ).toBeLessThan(posicao.get(alvo)!);
      }
    }

    expect(conferidas).toBeGreaterThan(5);
  });
});

describe("removeTenant", () => {
  it("apaga na ordem declarada, sempre filtrando pelo tenantId", async () => {
    await removeTenant("cantina-teste");

    const apagados = chamadas
      .filter((c) => c.operacao === "deleteMany")
      .map((c) => c.modelo);

    expect(apagados).toEqual([
      // Fora de ORDEM_DE_EXCLUSAO por não ter tenantId, e antes do laço porque
      // referencia a Assinatura, que está dentro dele.
      "cobranca",
      ...ORDEM_DE_EXCLUSAO.map((m) => m[0].toLowerCase() + m.slice(1)),
    ]);

    for (const c of chamadas.filter(
      (c) => c.operacao === "deleteMany" && c.modelo !== "cobranca"
    )) {
      expect(c.args).toEqual({ where: { tenantId: TENANT.id } });
    }
  });

  /**
   * Cobranca é a única que não tem tenantId: ela pende da assinatura, e é por
   * ela que se chega ao tenant. Um filtro errado aqui apagaria cobrança de
   * outro restaurante, que é o pior erro possível numa remoção.
   */
  it("apaga a cobrança pela assinatura do tenant, não solta", async () => {
    await removeTenant("cantina-teste");

    const cobranca = chamadas.find(
      (c) => c.modelo === "cobranca" && c.operacao === "deleteMany"
    );
    expect(cobranca?.args).toEqual({
      where: { assinatura: { tenantId: TENANT.id } },
    });
  });

  it("apaga o tenant só depois de todos os filhos", async () => {
    await removeTenant("cantina-teste");

    const ultima = chamadas[chamadas.length - 1];
    expect(ultima.modelo).toBe("tenant");
    expect(ultima.operacao).toBe("delete");
    expect(ultima.args).toEqual({ where: { id: TENANT.id } });
  });

  it("desvincula o lead em vez de apagá-lo", async () => {
    await removeTenant("cantina-teste");

    const noLead = chamadas.filter((c) => c.modelo === "lead");
    expect(noLead).toHaveLength(1);
    expect(noLead[0].operacao).toBe("updateMany");
    expect(noLead[0].args).toEqual({
      where: { tenantId: TENANT.id },
      data: { tenantId: null },
    });
  });

  /**
   * Checar só a FORMA da chamada (que existe, com que argumentos) não pega o
   * bug mais perigoso: um `updateMany` correto que rodasse DEPOIS do
   * `tenant.delete()` passaria nos asserts acima do mesmo jeito, e quebraria
   * em produção com foreign key violation — o delete do tenant não pode
   * acontecer enquanto Lead/Inscricao ainda apontam para ele. Por isso os dois
   * testes abaixo comparam índice em `chamadas`, que preserva a ordem real de
   * execução dentro da transação.
   */
  it("desvincula o lead antes de apagar o tenant, não depois", async () => {
    await removeTenant("cantina-teste");

    const indiceDoDesvinculo = chamadas.findIndex(
      (c) => c.modelo === "lead" && c.operacao === "updateMany"
    );
    const indiceDoDelete = chamadas.findIndex(
      (c) => c.modelo === "tenant" && c.operacao === "delete"
    );

    expect(indiceDoDesvinculo).toBeGreaterThanOrEqual(0);
    expect(indiceDoDelete).toBeGreaterThanOrEqual(0);
    expect(
      indiceDoDesvinculo,
      "o desvínculo do Lead precisa acontecer antes de tenant.delete(), senão a foreign key bloqueia o delete em produção"
    ).toBeLessThan(indiceDoDelete);
  });

  /**
   * Mesma razão do Lead: Inscricao é registro comercial da plataforma (a
   * tentativa de assinatura que reservou o slug), não dado do restaurante.
   * Apagar junto reescreveria "esta assinatura nunca existiu" por causa de um
   * cliente que saiu.
   */
  it("desvincula a inscrição em vez de apagá-la", async () => {
    await removeTenant("cantina-teste");

    const naInscricao = chamadas.filter((c) => c.modelo === "inscricao");
    expect(naInscricao).toHaveLength(1);
    expect(naInscricao[0].operacao).toBe("updateMany");
    expect(naInscricao[0].args).toEqual({
      where: { tenantId: TENANT.id },
      data: { tenantId: null },
    });
  });

  it("desvincula a inscrição antes de apagar o tenant, não depois", async () => {
    await removeTenant("cantina-teste");

    const indiceDoDesvinculo = chamadas.findIndex(
      (c) => c.modelo === "inscricao" && c.operacao === "updateMany"
    );
    const indiceDoDelete = chamadas.findIndex(
      (c) => c.modelo === "tenant" && c.operacao === "delete"
    );

    expect(indiceDoDesvinculo).toBeGreaterThanOrEqual(0);
    expect(indiceDoDelete).toBeGreaterThanOrEqual(0);
    expect(
      indiceDoDesvinculo,
      "o desvínculo da Inscricao precisa acontecer antes de tenant.delete(), senão a foreign key bloqueia o delete em produção"
    ).toBeLessThan(indiceDoDelete);
  });

  it("recusa o tenant default, que é o site institucional", async () => {
    findUniqueTenant.mockResolvedValue({ ...TENANT, slug: "default" });

    await expect(removeTenant("default")).rejects.toMatchObject({
      code: "TENANT_PROTEGIDO",
    });
    expect(chamadas.filter((c) => c.operacao === "deleteMany")).toHaveLength(0);
  });

  it("recusa slug que não existe, em vez de sair apagando nada", async () => {
    findUniqueTenant.mockResolvedValue(null);

    await expect(removeTenant("nao-existe")).rejects.toBeInstanceOf(
      RemocaoError
    );
    expect(chamadas.filter((c) => c.operacao === "deleteMany")).toHaveLength(0);
  });

  it("devolve o resumo do que apagou", async () => {
    const resumo = await removeTenant("cantina-teste");

    expect(resumo.tenant.slug).toBe("cantina-teste");
    expect(Object.keys(resumo.contagens).sort()).toEqual(
      [...ORDEM_DE_EXCLUSAO, "Cobranca"].sort()
    );
  });
});
