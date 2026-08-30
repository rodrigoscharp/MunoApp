import type { Prisma, TipoEvento } from "@prisma/client";

/**
 * O único ponto que escreve EventoFunil, e o único que decide que gravar
 * evento nunca derruba o que estava acontecendo.
 *
 * Aceita tanto prismaUnscoped quanto o `tx` de uma transação, porque o
 * PROVISIONADO precisa nascer dentro da transação que cria a assinatura, e o
 * CHECKOUT_CRIADO precisa nascer fora de qualquer uma.
 *
 * O tipo é derivado do Prisma, e não escrito à mão: uma interface estrutural
 * com a assinatura simplificada de `create` NÃO aceita o PrismaClient real,
 * porque o create dele é genérico. Pick sobre TransactionClient é satisfeito
 * pelos dois, que é exatamente o que esta função precisa.
 */
export type ClienteDeEvento = Pick<Prisma.TransactionClient, "eventoFunil">;

export async function registrarEvento(
  cliente: ClienteDeEvento,
  dados: { sessaoId: string | null; tipo: TipoEvento; detalhe?: string | null }
): Promise<void> {
  try {
    await cliente.eventoFunil.create({
      data: {
        sessaoId: dados.sessaoId,
        tipo: dados.tipo,
        detalhe: dados.detalhe ?? null,
      },
    });
  } catch (erro) {
    // Nunca propaga. Evento é relatório, e o caminho que gera receita não pode
    // depender do que gera relatório: um blip aqui não pode abortar um
    // checkout que já virou cobrança nem uma transação de provisionamento.
    //
    // O log traz o tipo, nunca o detalhe: detalhe pode carregar o que a pessoa
    // escolheu, e log não é lugar de dado de cliente.
    console.error(`[funil] falha ao registrar evento ${dados.tipo}`, erro);
  }
}
