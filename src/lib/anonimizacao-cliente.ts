import { prismaUnscoped } from "@/lib/prisma";

/**
 * Atende o pedido de um titular ("apaguem meus dados", LGPD art. 18) sobre os
 * dados de consumidor de UM restaurante.
 *
 * Os pedidos ficam: são registro do restaurante, com valor fiscal. O que sai é
 * o que identifica a pessoa: nome, telefone, endereço, observações do pedido e
 * dos itens (restrição alimentar pode ser dado de saúde), conversa de chat,
 * posição do entregador e a conta. É anonimização, e não exclusão, de
 * propósito: apagar a linha do pedido reescreveria o faturamento do restaurante
 * por causa de um cliente.
 *
 * Quem decide é o restaurante (controlador); a Muno executa como operadora.
 */

export type AnonimizacaoErrorCode =
  | "SEM_IDENTIFICADOR"
  | "TENANT_NAO_ENCONTRADO"
  | "CONTA_DE_EQUIPE";

export class AnonimizacaoError extends Error {
  constructor(
    public code: AnonimizacaoErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AnonimizacaoError";
  }
}

export type AlvoDaAnonimizacao = { slug: string; telefone?: string; email?: string };

const soDigitos = (v: string) => v.replace(/\D/g, "");

/** Mesmo telefone com ou sem máscara, com ou sem o 55 do país. */
function mesmoTelefone(a: string, b: string): boolean {
  const x = soDigitos(a);
  const y = soDigitos(b);
  if (x.length < 8 || y.length < 8) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}

async function localizar({ slug, telefone, email }: AlvoDaAnonimizacao) {
  if (!telefone && !email) {
    throw new AnonimizacaoError("SEM_IDENTIFICADOR", "Informe o telefone ou o e-mail do cliente.");
  }

  const tenant = await prismaUnscoped.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    throw new AnonimizacaoError("TENANT_NAO_ENCONTRADO", `Restaurante "${slug}" não existe.`);
  }

  const usuario = email
    ? await prismaUnscoped.user.findFirst({
        where: { tenantId: tenant.id, email: { equals: email, mode: "insensitive" } },
        select: { id: true, role: true },
      })
    : null;

  // Conta de equipe não é "cliente": anonimizá-la trancaria o restaurante para
  // fora do próprio painel.
  if (usuario && usuario.role !== "CUSTOMER") {
    throw new AnonimizacaoError(
      "CONTA_DE_EQUIPE",
      "Este e-mail é de uma conta da equipe do restaurante, não de um cliente."
    );
  }

  const candidatos = await prismaUnscoped.order.findMany({
    where: {
      tenantId: tenant.id,
      OR: [
        ...(usuario ? [{ userId: usuario.id }] : []),
        ...(telefone ? [{ customerPhone: { not: null } }] : []),
      ],
    },
    select: { id: true, customerPhone: true, userId: true },
  });

  const pedidos = candidatos.filter(
    (p) =>
      (usuario && p.userId === usuario.id) ||
      (telefone && p.customerPhone && mesmoTelefone(p.customerPhone, telefone))
  );

  return { tenant, usuario, ids: pedidos.map((p) => p.id) };
}

export async function contarDadosDoCliente(alvo: AlvoDaAnonimizacao) {
  const { tenant, usuario, ids } = await localizar(alvo);
  const filtro = { orderId: { in: ids }, tenantId: tenant.id };

  return {
    tenant,
    temConta: !!usuario,
    pedidos: ids.length,
    mensagensDeChat: ids.length ? await prismaUnscoped.chatMessage.count({ where: filtro }) : 0,
    rastreamentos: ids.length ? await prismaUnscoped.deliveryTracking.count({ where: filtro }) : 0,
  };
}

export async function anonimizarCliente(alvo: AlvoDaAnonimizacao) {
  const { tenant, usuario, ids } = await localizar(alvo);

  if (ids.length > 0 || usuario) {
    await prismaUnscoped.$transaction(async (tx) => {
      if (ids.length > 0) {
        const filtro = { orderId: { in: ids }, tenantId: tenant.id };
        await tx.chatMessage.deleteMany({ where: filtro });
        await tx.deliveryTracking.deleteMany({ where: filtro });
        await tx.orderItem.updateMany({ where: filtro, data: { notes: null } });
        await tx.order.updateMany({
          where: { id: { in: ids }, tenantId: tenant.id },
          data: { customerName: null, customerPhone: null, deliveryAddress: null, notes: null },
        });
      }
      if (usuario) {
        await tx.user.update({
          where: { id: usuario.id },
          data: {
            name: "Cliente removido",
            email: `removido+${usuario.id}@invalid.local`,
            password: null,
          },
        });
      }
    });
  }

  return { tenant, temConta: !!usuario, pedidos: ids.length };
}
