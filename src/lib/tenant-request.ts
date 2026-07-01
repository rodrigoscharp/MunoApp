import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { runWithTenant } from "@/lib/tenant-context";

// Server Components não passam pelo withTenant() das API routes — leem o
// tenantId direto do header que o proxy.ts já resolveu pelo subdomínio.
export async function getRequestTenantId(): Promise<string> {
  const h = await headers();
  const tenantId = h.get("x-tenant-id");
  if (!tenantId) notFound();
  return tenantId;
}

export async function withRequestTenant<T>(fn: (tenantId: string) => Promise<T>): Promise<T> {
  const tenantId = await getRequestTenantId();
  return runWithTenant(tenantId, () => fn(tenantId));
}
