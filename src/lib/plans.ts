import type { PlanoTenant } from "@prisma/client";

// Header setado pelo proxy.ts junto com x-tenant-id, pra quem precisa saber
// o plano do tenant sem fazer outra query (Server Components e Route
// Handlers já recebem o tenant resolvido pelo subdomínio).
export const TENANT_PLANO_HEADER = "x-tenant-plano";

// Único ponto de verdade sobre o que cada plano libera. Se um terceiro plano
// aparecer, a lista de planos que têm a feature muda aqui, não em cada rota.
export function tenantTemMesaQr(plano: PlanoTenant): boolean {
  return plano === "MEMBRO_MESA_QR";
}

export const PLANO_LABELS: Record<PlanoTenant, string> = {
  MEMBRO: "Membro",
  MEMBRO_MESA_QR: "Membro + Mesas QR",
};

// Fail-closed: header ausente ou com um valor que este código não reconhece
// vira MEMBRO, nunca a feature paga. Isso cobre tanto uma request que por
// algum motivo não passou pelo proxy quanto uma versão futura do enum que
// este deploy ainda não conhece.
export function planoFromHeaderValue(value: string | null): PlanoTenant {
  if (value === "MEMBRO_MESA_QR") return "MEMBRO_MESA_QR";
  return "MEMBRO";
}
