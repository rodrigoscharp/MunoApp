import { AsyncLocalStorage } from "node:async_hooks";

interface TenantStore {
  tenantId: string;
}

// Precisa sobreviver em globalThis (mesmo truque usado em src/lib/prisma.ts):
// em dev, cada rota é recompilada em bundles separados, e o Prisma Client
// (cacheado em globalThis para não reabrir conexão a cada reload) pode ter
// capturado getCurrentTenantId de um bundle diferente do desta request. Sem
// isso, runWithTenant() e getCurrentTenantId() acabam usando instâncias de
// AsyncLocalStorage diferentes e nunca se enxergam.
const globalForTenant = globalThis as unknown as {
  tenantStorage: AsyncLocalStorage<TenantStore> | undefined;
};

const storage = globalForTenant.tenantStorage ?? new AsyncLocalStorage<TenantStore>();

if (process.env.NODE_ENV !== "production") globalForTenant.tenantStorage = storage;

export function runWithTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ tenantId }, fn);
}

export function getCurrentTenantId(): string {
  const store = storage.getStore();
  if (!store) {
    throw new Error(
      "Nenhum tenant no contexto da request. Toda query precisa rodar dentro de runWithTenant()."
    );
  }
  return store.tenantId;
}
