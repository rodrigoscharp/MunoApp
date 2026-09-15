import { PrismaClient } from "@prisma/client";
import { getCurrentTenantId } from "@/lib/tenant-context";
import { TENANT_SCOPED_MODELS } from "@/lib/tenant-scoped-models";

const WHERE_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "updateMany",
  // Par de createManyAndReturn, existe desde o Prisma 6.2 e é fácil de esquecer:
  // sem esta linha a operação escapa do filtro e atualiza linha de outro
  // restaurante. src/lib/prisma.test.ts percorre a lista inteira por isso.
  "updateManyAndReturn",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
  "upsert",
]);

const DATA_ARRAY_OPERATIONS = new Set(["createMany", "createManyAndReturn"]);

// Escritas que recebem `data` de uma linha que já existe. O where escopado
// impede de alcançar a linha de outro restaurante; prenderAoTenant impede de
// mandar a própria linha para outro restaurante.
const UPDATE_OPERATIONS = new Set(["update", "updateMany", "updateManyAndReturn"]);

/**
 * Se a escrita tentou mexer no tenant, pela coluna ou pela relação, o tenant
 * passa a ser o do contexto. Se não tentou, o data sai intacto: injetar
 * tenantId em todo update mudaria os argumentos de toda escrita legítima.
 */
function prenderAoTenant(data: unknown, tenantId: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  if (!("tenantId" in data) && !("tenant" in data)) return data;
  const { tenant: _tenant, ...resto } = data as Record<string, unknown>;
  return { ...resto, tenantId };
}

function createPrismaClient() {
  const basePrisma = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  // Prisma permite combinar o(s) campo(s) únicos de um where com filtros
  // adicionais ("extended where unique input", estável desde o Prisma 5),
  // então basta mesclar tenantId em `where` mesmo para findUnique/update/delete —
  // não é preciso reescrever essas operações para findFirst.
  return basePrisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const tenantId = getCurrentTenantId();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const a = args as any;

          if (WHERE_OPERATIONS.has(operation)) {
            a.where = { ...a.where, tenantId };
          }

          if (operation === "create") {
            a.data = { ...a.data, tenantId };
          }

          if (UPDATE_OPERATIONS.has(operation)) {
            a.data = prenderAoTenant(a.data, tenantId);
          }

          if (operation === "upsert") {
            a.create = { ...a.create, tenantId };
            a.update = prenderAoTenant(a.update, tenantId);
          }

          if (DATA_ARRAY_OPERATIONS.has(operation) && Array.isArray(a.data)) {
            a.data = a.data.map((d: object) => ({ ...d, tenantId }));
          }

          return query(a);
        },
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
  prismaUnscoped: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Cliente sem o escopo automático de tenant — só para os poucos pontos de
// entrada que não têm subdomínio pra resolver o tenant (webhooks, crons) e
// por isso precisam descobrir o tenantId a partir de um id global (ex.: o
// id do pedido) antes de entrar no contexto normal via runWithTenant().
export const prismaUnscoped =
  globalForPrisma.prismaUnscoped ?? new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaUnscoped = prismaUnscoped;
}
