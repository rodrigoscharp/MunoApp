import crypto from "node:crypto";
import { prismaUnscoped } from "@/lib/prisma";
import { removeTenant } from "@/lib/tenant-removal";
import { runWithTenant } from "@/lib/tenant-context";

const criados: string[] = [];

/** Restaurante de teste com slug único. Apague com `limparTenants()`. */
export async function criarTenant(prefixo = "teste") {
  const slug = `${prefixo}-${crypto.randomBytes(4).toString("hex")}`;
  const tenant = await prismaUnscoped.tenant.create({
    data: { nome: `Restaurante ${slug}`, slug },
  });
  criados.push(slug);
  return tenant;
}

export function registrarParaLimpeza(slug: string) {
  criados.push(slug);
}

export async function limparTenants() {
  for (const slug of criados.splice(0)) {
    await removeTenant(slug).catch(() => {});
  }
}

export const pedidoMinimo = (tenantId: string, extra: Record<string, unknown> = {}) => ({
  tenantId,
  paymentMethod: "PIX" as const,
  total: 10,
  ...extra,
});

/**
 * Roda a consulta dentro do contexto do restaurante. O `await` DENTRO do
 * callback não é detalhe: a query do Prisma é preguiçosa e só começa quando é
 * aguardada, e a extensão de tenant lê o contexto nesse instante. Devolver a
 * promessa sem aguardá-la executaria a query fora do contexto.
 */
export function comTenant<T>(tenantId: string, fn: () => PromiseLike<T>): Promise<T> {
  return runWithTenant(tenantId, async () => await fn());
}
