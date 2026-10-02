import { prismaUnscoped } from "@/lib/prisma";

/**
 * Retenção de dado pessoal de consumidor, aplicada pelo cron diário.
 *
 * O PRAZO É DECISÃO DE NEGÓCIO (e, em parte, jurídica): quanto tempo o
 * restaurante precisa guardar nome, telefone e endereço de quem pediu. Por
 * isso fica desligada até `RETENCAO_PEDIDOS_MESES` ser definida. Ligada, o
 * pedido em si fica (valor fiscal, faturamento), e só o que identifica a
 * pessoa sai: é a mesma anonimização do pedido de titular
 * (anonimizacao-cliente.ts), feita em lote e por idade.
 *
 * Trabalho de plataforma, entre todos os restaurantes: prismaUnscoped.
 */

export function mesesDeRetencao(
  env: Record<string, string | undefined> = process.env
): number | null {
  const n = Number(env.RETENCAO_PEDIDOS_MESES);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export async function aplicarRetencao(agora: Date, meses: number) {
  const corte = new Date(agora);
  corte.setUTCMonth(corte.getUTCMonth() - meses);

  return prismaUnscoped.$transaction(async (tx) => {
    const antigo = { order: { createdAt: { lt: corte } } };

    const mensagens = await tx.chatMessage.deleteMany({ where: antigo });
    const rastreamentos = await tx.deliveryTracking.deleteMany({ where: antigo });
    const itens = await tx.orderItem.updateMany({
      where: { notes: { not: null }, ...antigo },
      data: { notes: null },
    });
    const pedidos = await tx.order.updateMany({
      where: {
        createdAt: { lt: corte },
        // Só o que ainda tem dado: rodar de novo não regrava o que já foi limpo.
        OR: [
          { customerName: { not: null } },
          { customerPhone: { not: null } },
          { deliveryAddress: { not: null } },
          { notes: { not: null } },
        ],
      },
      data: { customerName: null, customerPhone: null, deliveryAddress: null, notes: null },
    });

    return {
      pedidos: pedidos.count,
      itens: itens.count,
      mensagensDeChat: mensagens.count,
      rastreamentos: rastreamentos.count,
    };
  });
}

/** Token de redefinição vencido não serve para nada e só ocupa linha. */
export async function limparTokensExpirados(agora: Date): Promise<number> {
  const { count } = await prismaUnscoped.passwordResetToken.deleteMany({
    where: { expiresAt: { lt: agora } },
  });
  return count;
}
