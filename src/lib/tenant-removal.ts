import type { Tenant } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";

/**
 * Ordem de exclusão dos dados de um tenant. Filho antes do pai, sempre.
 *
 * Nenhuma relação com Tenant no schema tem `onDelete: Cascade` — foi decisão de
 * não deixar um `tenant.delete()` acidental levar os pedidos de um restaurante
 * junto. O preço é este: apagar de verdade é apagar model por model, na mão, e
 * a ordem importa, porque o Postgres recusa a exclusão do pai enquanto o filho
 * aponta para ele.
 *
 * A lista é conferida em dois eixos por tenant-removal.test.ts: cobertura
 * (bate exatamente com TENANT_SCOPED_MODELS) e ordem (lida das foreign keys do
 * próprio schema.prisma). Model novo com tenantId quebra o teste, não a
 * remoção.
 */
export const ORDEM_DE_EXCLUSAO = [
  "OrderItem",
  "ChatMessage",
  "DeliveryTracking",
  "Order",
  "Payment",
  "MenuItem",
  "Category",
  "Table",
  "Coupon",
  "PaymentConnection",
  "Setting",
  "PasswordResetToken",
  "DeliveryZone",
  "User",
  "Assinatura",
] as const;

// Tenants que a plataforma não pode perder. `default` é quem responde por
// www.<domínio raiz> — apagá-lo derruba o site institucional, não um cliente.
const TENANTS_PROTEGIDOS = new Set(["default"]);

export type RemocaoErrorCode = "TENANT_NAO_ENCONTRADO" | "TENANT_PROTEGIDO";

export class RemocaoError extends Error {
  constructor(
    message: string,
    readonly code: RemocaoErrorCode
  ) {
    super(message);
    this.name = "RemocaoError";
  }
}

export type ResumoDaRemocao = {
  tenant: Pick<Tenant, "id" | "nome" | "slug">;
  contagens: Record<string, number>;
  leadsDesvinculados: number;
  inscricoesDesvinculadas: number;
};

/** `OrderItem` → `orderItem`, que é como o delegate aparece no Prisma Client. */
function delegateDe(modelo: string): string {
  return modelo[0].toLowerCase() + modelo.slice(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Delegate = any;

async function buscarTenant(slug: string) {
  const tenant = await prismaUnscoped.tenant.findUnique({ where: { slug } });

  if (!tenant) {
    throw new RemocaoError(
      `Não existe tenant com o slug "${slug}".`,
      "TENANT_NAO_ENCONTRADO"
    );
  }
  if (TENANTS_PROTEGIDOS.has(tenant.slug)) {
    throw new RemocaoError(
      `O tenant "${tenant.slug}" é da própria plataforma e não pode ser removido.`,
      "TENANT_PROTEGIDO"
    );
  }
  return tenant;
}

/**
 * Conta o que existe hoje sob um tenant, sem apagar nada. É o que o script
 * mostra antes de pedir confirmação: número na tela é a única forma de perceber
 * que o slug digitado não era o que se pensava.
 */
export async function contarDadosDoTenant(
  slug: string
): Promise<ResumoDaRemocao> {
  const tenant = await buscarTenant(slug);

  const contagens: Record<string, number> = {};
  for (const modelo of ORDEM_DE_EXCLUSAO) {
    const delegate = (prismaUnscoped as unknown as Record<string, Delegate>)[
      delegateDe(modelo)
    ];
    contagens[modelo] = await delegate.count({
      where: { tenantId: tenant.id },
    });
  }

  // Fora do laço pelo mesmo motivo da remoção: Cobranca não tem tenantId.
  contagens.Cobranca = await prismaUnscoped.cobranca.count({
    where: { assinatura: { tenantId: tenant.id } },
  });

  const leadsDesvinculados = await prismaUnscoped.lead.count({
    where: { tenantId: tenant.id },
  });

  // Mesma lógica do Lead: a Inscricao não é apagada, só perde o vínculo — ver
  // o comentário no cabeçalho de removeTenant.
  const inscricoesDesvinculadas = await prismaUnscoped.inscricao.count({
    where: { tenantId: tenant.id },
  });

  return { tenant, contagens, leadsDesvinculados, inscricoesDesvinculadas };
}

/**
 * Apaga um tenant e tudo que pende dele, numa transação só.
 *
 * Lead e Inscricao são as exceções: nenhum dos dois é apagado, só perdem o
 * vínculo. Ambos são registro comercial da plataforma, não dado do
 * restaurante — apagar junto reescreveria o histórico ("este lead"/"esta
 * assinatura nunca existiu") por causa de um cliente que saiu. O `tenantId`
 * dos dois é opcional justamente para poder ficar solto.
 *
 * A proteção contra foreign key é dupla: a FK de ambos já é `ON DELETE SET
 * NULL`, então o Postgres desvincularia sozinho mesmo sem o `updateMany`
 * abaixo — o `tenant.delete()` não quebraria de qualquer forma. O
 * `updateMany` explícito existe por outro motivo: é a única forma de o código
 * SABER quantas linhas foram desvinculadas, para reportar ao operador no
 * preview do `tenant:remove` (ver contarDadosDoTenant). Mesmo assim, os dois
 * updateMany precisam continuar rodando antes de `tenant.delete()` dentro
 * desta transação: um DELETE que dependesse só do SET NULL do Postgres
 * funcionaria, mas moveria a contagem para depois do fato consumado, e é
 * exatamente essa ordem que tenant-removal.test.ts trava por índice.
 */
export async function removeTenant(slug: string): Promise<ResumoDaRemocao> {
  const tenant = await buscarTenant(slug);

  return prismaUnscoped.$transaction(async (tx) => {
    const contagens: Record<string, number> = {};

    // Cobranca sai antes do laço porque a Assinatura, que ela referencia, está
    // dentro dele. Fora de ORDEM_DE_EXCLUSAO por não ter coluna tenantId: o
    // caminho até o tenant passa pela assinatura, e o laço só sabe filtrar por
    // tenantId. Apagar cobrança dói — é histórico financeiro —, mas o que
    // sobrasse não teria a quem pertencer.
    contagens.Cobranca = (
      await tx.cobranca.deleteMany({
        where: { assinatura: { tenantId: tenant.id } },
      })
    ).count;

    for (const modelo of ORDEM_DE_EXCLUSAO) {
      const delegate = (tx as unknown as Record<string, Delegate>)[
        delegateDe(modelo)
      ];
      const { count } = await delegate.deleteMany({
        where: { tenantId: tenant.id },
      });
      contagens[modelo] = count;
    }

    const { count: leadsDesvinculados } = await tx.lead.updateMany({
      where: { tenantId: tenant.id },
      data: { tenantId: null },
    });

    // Inscricao segue a regra do Lead: registro comercial da plataforma, não
    // dado do restaurante. Apagá-la reescreveria o histórico de vendas ("esta
    // assinatura nunca existiu") por causa de um cliente que saiu. A FK já é
    // ON DELETE SET NULL — o Postgres desvincularia sozinho mesmo sem este
    // updateMany —, mas só ele nos diz QUANTAS inscrições foram afetadas, e é
    // essa contagem que contarDadosDoTenant mostra ao operador antes de apagar
    // (ver o cabeçalho de removeTenant, acima, para o porquê da ordem).
    const { count: inscricoesDesvinculadas } = await tx.inscricao.updateMany({
      where: { tenantId: tenant.id },
      data: { tenantId: null },
    });

    await tx.tenant.delete({ where: { id: tenant.id } });

    return { tenant, contagens, leadsDesvinculados, inscricoesDesvinculadas };
  });
}
