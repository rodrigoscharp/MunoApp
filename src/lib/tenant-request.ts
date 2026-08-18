import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { runWithTenant } from "@/lib/tenant-context";
import { TENANT_PLANO_HEADER, planoFromHeaderValue } from "@/lib/plans";
import type { PlanoTenant } from "@prisma/client";

// Server Components não passam pelo withTenant() das API routes — leem o
// tenantId direto do header que o proxy.ts já resolveu pelo subdomínio.
export async function getRequestTenantId(): Promise<string> {
  const h = await headers();
  const tenantId = h.get("x-tenant-id");
  if (!tenantId) notFound();
  return tenantId;
}

// Mesmo header, mas o plano nunca deve derrubar uma página com notFound() —
// ausência/valor desconhecido só significa "sem a feature paga" (fail-closed
// em planoFromHeaderValue), nunca um erro de roteamento.
export async function getRequestTenantPlano(): Promise<PlanoTenant> {
  const h = await headers();
  return planoFromHeaderValue(h.get(TENANT_PLANO_HEADER));
}

export async function withRequestTenant<T>(fn: (tenantId: string) => Promise<T>): Promise<T> {
  const tenantId = await getRequestTenantId();
  return runWithTenant(tenantId, () => fn(tenantId));
}
