import { PrismaClient } from "@prisma/client";
import { getCurrentTenantId } from "@/lib/tenant-context";

// Models que carregam tenantId e devem ser automaticamente filtrados/preenchidos
// pelo tenant da request atual (ver src/lib/tenant-context.ts).
const TENANT_SCOPED_MODELS = new Set([
  "User",
  "Category",
  "MenuItem",
  "Order",
  "Table",
  "Payment",
  "Setting",
  "DeliveryZone",
  "ChatMessage",
  "PaymentConnection",
  "PasswordResetToken",
]);

const WHERE_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
  "upsert",
]);

const DATA_ARRAY_OPERATIONS = new Set(["createMany", "createManyAndReturn"]);

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

          if (operation === "upsert") {
            a.create = { ...a.create, tenantId };
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
