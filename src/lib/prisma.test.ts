/**
 * A extensão de tenant é o que separa um restaurante do outro.
 *
 * O AGENTS.md é explícito: o RLS **não** escopa nada (as policies comparam com
 * `current_setting('app.current_tenant')`, que nunca é definida, e a aplicação
 * conecta como `postgres`, que tem BYPASSRLS). Quem impede o pedido de um
 * restaurante de aparecer no painel de outro é exclusivamente o interceptador
 * daqui. Um furo neste arquivo não é pego por nenhuma outra camada.
 *
 * O teste ataca a extensão sem banco: substitui o PrismaClient por um dublê que
 * apenas captura a configuração passada a `$extends`, e depois chama o
 * interceptador na mão, conferindo o que ele entrega para a query real.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { runWithTenant } from "@/lib/tenant-context";

type ArgsQualquer = Record<string, unknown>;

interface Interceptador {
  (params: {
    model?: string;
    operation: string;
    args: ArgsQualquer;
    query: (args: ArgsQualquer) => Promise<ArgsQualquer>;
  }): Promise<ArgsQualquer>;
}

const capturado: { config?: { query: { $allModels: { $allOperations: Interceptador } } } } = {};

vi.mock("@prisma/client", () => {
  class PrismaClient {
    $extends(config: { query: { $allModels: { $allOperations: Interceptador } } }) {
      capturado.config = config;
      return this;
    }
  }
  return { PrismaClient };
});

let interceptar: Interceptador;

beforeAll(async () => {
  // Importar o módulo é o que dispara createPrismaClient() e, com ele, o
  // $extends que o dublê captura.
  await import("@/lib/prisma");
  interceptar = capturado.config!.query.$allModels.$allOperations;
});

/**
 * Roda o interceptador e devolve os args que ele repassou para a query real —
 * que é exatamente o que o banco veria.
 */
async function argsEntregues(
  model: string | undefined,
  operation: string,
  args: ArgsQualquer,
  tenantId: string | null = "restaurante-a"
): Promise<ArgsQualquer> {
  const query = vi.fn(async (a: ArgsQualquer) => a);
  const chamada = () => interceptar({ model, operation, args, query });
  if (tenantId === null) {
    await chamada();
  } else {
    await runWithTenant(tenantId, chamada);
  }
  return query.mock.calls[0][0];
}

describe("escopo automático de tenant", () => {
  it("injeta tenantId no where das operações de leitura", async () => {
    const entregue = await argsEntregues("Order", "findMany", { where: { status: "PENDING" } });
    expect(entregue.where).toEqual({ status: "PENDING", tenantId: "restaurante-a" });
  });

  it("injeta tenantId mesmo quando a chamada não passa where nenhum", async () => {
    const entregue = await argsEntregues("Order", "findMany", {});
    expect(entregue.where).toEqual({ tenantId: "restaurante-a" });
  });

  it("injeta tenantId no data do create", async () => {
    const entregue = await argsEntregues("MenuItem", "create", { data: { name: "X-Salada" } });
    expect(entregue.data).toEqual({ name: "X-Salada", tenantId: "restaurante-a" });
  });

  it("carimba cada linha do createMany", async () => {
    const entregue = await argsEntregues("Category", "createMany", {
      data: [{ name: "Lanches" }, { name: "Bebidas" }],
    });
    expect(entregue.data).toEqual([
      { name: "Lanches", tenantId: "restaurante-a" },
      { name: "Bebidas", tenantId: "restaurante-a" },
    ]);
  });

  it("escopa where e create do upsert", async () => {
    const entregue = await argsEntregues("Setting", "upsert", {
      where: { key: "business_hours" },
      create: { key: "business_hours", value: "{}" },
      update: { value: "{}" },
    });
    expect(entregue.where).toEqual({ key: "business_hours", tenantId: "restaurante-a" });
    expect(entregue.create).toEqual({
      key: "business_hours",
      value: "{}",
      tenantId: "restaurante-a",
    });
  });

  it("deixa passar intacto o model que não é escopado por tenant", async () => {
    const entregue = await argsEntregues("Tenant", "findMany", { where: { slug: "outro" } });
    expect(entregue.where).toEqual({ slug: "outro" });
  });

  it("não exige contexto de tenant para model não escopado", async () => {
    // Lead e PlatformAdmin são lidos fora de qualquer subdomínio (landing, CRM).
    // Se a extensão pedisse tenant aqui, a captação de lead morreria no host raiz.
    await expect(argsEntregues("Lead", "findMany", {}, null)).resolves.toBeDefined();
  });

  it("recusa a query em model escopado quando não há tenant no contexto", async () => {
    await expect(argsEntregues("Order", "findMany", {}, null)).rejects.toThrow(
      /Nenhum tenant no contexto/
    );
  });
});

describe("o tenant do contexto vence o que a chamada pediu", () => {
  it("sobrescreve tentativa de ler o where de outro restaurante", async () => {
    const entregue = await argsEntregues("Order", "findMany", {
      where: { tenantId: "restaurante-b" },
    });
    expect((entregue.where as ArgsQualquer).tenantId).toBe("restaurante-a");
  });

  it("sobrescreve tentativa de gravar no tenant de outro restaurante", async () => {
    const entregue = await argsEntregues("MenuItem", "create", {
      data: { name: "X", tenantId: "restaurante-b" },
    });
    expect((entregue.data as ArgsQualquer).tenantId).toBe("restaurante-a");
  });
});

/**
 * O ponto cego. `WHERE_OPERATIONS` lista as operações que ganham tenantId no
 * where, e `DATA_ARRAY_OPERATIONS` cobre createMany/createManyAndReturn — mas o
 * par de `createManyAndReturn`, o `updateManyAndReturn` (Prisma >= 6.2, presente
 * no client gerado aqui), não aparece em nenhuma das duas listas.
 *
 * Uma escrita por essa porta sai sem filtro de tenant.
 */
describe("toda operação de escrita e leitura do client precisa ser escopada", () => {
  const LEITURAS = [
    "findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow",
    "count", "aggregate", "groupBy",
  ];
  const ESCRITAS_COM_WHERE = ["update", "updateMany", "updateManyAndReturn", "delete", "deleteMany"];

  it.each([...LEITURAS, ...ESCRITAS_COM_WHERE])(
    "%s filtra por tenantId",
    async (operacao) => {
      const entregue = await argsEntregues("Order", operacao, { where: { id: "pedido-1" } });
      expect(entregue.where).toEqual({ id: "pedido-1", tenantId: "restaurante-a" });
    }
  );

  it("updateManyAndReturn não altera linha de outro restaurante", async () => {
    const entregue = await argsEntregues("Order", "updateManyAndReturn", {
      where: { status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    expect((entregue.where as ArgsQualquer).tenantId).toBe("restaurante-a");
  });
});
