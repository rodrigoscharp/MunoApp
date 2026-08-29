import { prismaUnscoped } from "@/lib/prisma";
import { assinaturaTemPagamentoConfirmado } from "@/lib/assinatura/asaas";
import { provisionarInscricao } from "@/lib/assinatura/provisionamento";

/**
 * Teto por execução. O job roda uma vez por dia e cada candidata custa uma
 * chamada ao Asaas — sem teto, um acúmulo inesperado viraria uma varredura
 * ilimitada contra o gateway. O que passar do teto fica para a passada
 * seguinte, e a ordem por createdAt garante que ninguém seja esquecido para
 * sempre.
 */
const LIMITE_POR_PASSADA = 50;

export type ResultadoReconciliacao = {
  candidatas: number;
  provisionadas: number;
  falhas: number;
};

/**
 * A rede de segurança do provisionamento.
 *
 * O caminho normal é o webhook do Asaas: pagamento confirma, entrega chega,
 * restaurante nasce. Quando a entrega NÃO chega — fila do gateway
 * interrompida, deploy caindo no instante errado, rede — o cliente pagou e
 * nada aconteceu. Antes disto, o desfecho dependia de alguém ler um log.
 *
 * Aqui a pergunta é invertida: em vez de esperar o gateway avisar, nós
 * perguntamos. Quem está AGUARDANDO_PAGAMENTO e já tem assinatura no Asaas é
 * candidata; se o Asaas confirma pagamento, o provisionamento termina pelo
 * mesmo caminho do webhook — literalmente a mesma função, para os dois nunca
 * divergirem.
 *
 * Três decisões que valem explicitar:
 *
 * 1. Cada recuperação bem-sucedida VIRA LOG. Ela é a prova de que o webhook
 *    falhou naquele caso; consertar em silêncio arrumaria o sintoma e
 *    esconderia a causa.
 * 2. Falha numa candidata não interrompe as outras. Uma linha problemática
 *    não pode segurar todo mundo que está esperando.
 * 3. Não altera nada quando o Asaas diz que não houve pagamento. Quem não
 *    pagou continua aguardando, e a faxina de inscrição vencida — que roda
 *    depois desta — é quem decide soltar o slug.
 */
export async function reconciliarInscricoesPagas(
  agora: Date
): Promise<ResultadoReconciliacao> {
  void agora;

  const candidatas = await prismaUnscoped.inscricao.findMany({
    where: {
      status: "AGUARDANDO_PAGAMENTO",
      asaasSubscriptionId: { not: null },
    },
    // Quem espera há mais tempo é atendido antes — e é o que garante que uma
    // candidata além do teto seja alcançada na passada seguinte.
    orderBy: { createdAt: "asc" },
    take: LIMITE_POR_PASSADA,
  });

  let provisionadas = 0;
  let falhas = 0;

  for (const inscricao of candidatas) {
    try {
      const pago = await assinaturaTemPagamentoConfirmado(
        inscricao.asaasSubscriptionId!
      );
      if (!pago) continue;

      await provisionarInscricao(inscricao, { origem: "cron/reconciliacao" });
      provisionadas++;

      console.error(
        `[cron/reconciliacao] Inscricao ${inscricao.id} (slug ${inscricao.slug}) ` +
          `estava paga e não provisionada — provisionada agora. ` +
          `O webhook do Asaas não completou para este pagamento: verificar a fila.`
      );
    } catch (erro) {
      falhas++;
      console.error(
        `[cron/reconciliacao] Falha ao reconciliar a Inscricao ${inscricao.id} ` +
          `(slug ${inscricao.slug}) — fica para a próxima passada`,
        erro
      );
    }
  }

  return { candidatas: candidatas.length, provisionadas, falhas };
}
