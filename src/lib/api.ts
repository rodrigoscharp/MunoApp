import { NextRequest, NextResponse } from "next/server";
import { runWithTenant } from "@/lib/tenant-context";

export function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function withErrorHandling(
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[API Error]", msg);
    return apiError("Erro interno do servidor", 500);
  }
}

// Header preenchido pelo proxy.ts após resolver o tenant pelo subdomínio.
export function getTenantIdFromRequest(req: Request | NextRequest): string | null {
  return req.headers.get("x-tenant-id");
}

// Roda o handler dentro do contexto do tenant (toda query Prisma dentro dele
// é automaticamente escopada — ver src/lib/prisma.ts) e com o tratamento de
// erro padrão da API.
export async function withTenant(
  tenantId: string,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  return withErrorHandling(() => runWithTenant(tenantId, handler));
}
