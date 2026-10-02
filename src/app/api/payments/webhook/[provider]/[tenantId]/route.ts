import { reportarErro } from "@/lib/observabilidade";
import { NextRequest, NextResponse } from "next/server";
import { prisma, prismaUnscoped } from "@/lib/prisma";
import { runWithTenant } from "@/lib/tenant-context";
import { getPaymentProvider } from "@/lib/payments/factory";
import { InvalidWebhookSignatureError } from "@/lib/payments/types";
import { broadcastOrderUpdate } from "@/lib/realtime";
import { extractErrorMessage } from "@/lib/error-message";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string; tenantId: string }> }
) {
  const { provider: providerId, tenantId } = await params;

  try {
    // O tenantId vem da URL, que é PÚBLICA e não autentica nada — só serve
    // pra localizar a conexão. Quem autentica é a assinatura verificada
    // dentro de handleWebhook(), com o segredo daquele lojista.
    const connection = await prismaUnscoped.paymentConnection.findUnique({
      where: { tenantId_provider: { tenantId, provider: providerId } },
    });
    // Não revela se o tenant/provider existe — resposta idêntica em
    // qualquer caso de "nada a fazer".
    if (!connection) return NextResponse.json({ received: true });

    // Corpo CRU: Stripe e Abacate Pay assinam o texto exato recebido, e
    // re-serializar um objeto parseado muda os bytes e invalida a
    // assinatura. Cada adapter faz o próprio parse.
    const rawBody = await req.text();

    let result;
    try {
      result = await getPaymentProvider(providerId).handleWebhook(
        rawBody,
        req.headers,
        connection,
        new URL(req.url)
      );
    } catch (err) {
      if (err instanceof InvalidWebhookSignatureError) {
        return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
      }
      throw err;
    }
    if (!result) return NextResponse.json({ received: true });

    // Assinatura validada: é a única prova possível de que o webhook secret
    // colado pelo lojista está correto (não dá pra verificar isso por API).
    await prismaUnscoped.paymentConnection.update({
      where: { id: connection.id },
      data: { lastCheckedAt: new Date() },
    });

    // O tenant já vem da URL e foi validado pela assinatura — não é mais
    // preciso descobri-lo pelo orderId. Toda leitura/escrita do pedido
    // acontece dentro do contexto do tenant, pra notificação de um tenant
    // nunca alcançar o pedido de outro.
    //
    // Gateway reentrega, repete e entrega fora de ordem. Por isso cada escrita
    // carrega no `where` o estado de que parte (updateMany é atômico, ao
    // contrário de ler e depois gravar): o evento só vale se o pedido ainda
    // está onde o evento supõe, e repeti-lo não muda nada.
    await runWithTenant(tenantId, async () => {
      let mudou = false;

      if (result.status === "approved") {
        // O gateway diz quanto recebeu: se não cobre o total do pedido, não
        // é este pagamento que quita. Autenticado pelo segredo do lojista,
        // então o caso real é cobrança paga a menor na conta do próprio
        // lojista ou um erro de integração, mas quitar R$ 80 com R$ 1 é o
        // tipo de coisa que ninguém quer descobrir no fechamento.
        if (result.amountCents !== undefined) {
          const pedido = await prisma.order.findFirst({
            where: { id: result.orderId },
            select: { total: true },
          });
          if (pedido && result.amountCents < Math.round(Number(pedido.total) * 100)) {
            console.error(
              `[webhook/pagamento] valor pago menor que o total, pedido NÃO quitado: ` +
                `tenant=${tenantId} order=${result.orderId} pago=${result.amountCents} ` +
                `total=${Math.round(Number(pedido.total) * 100)}`
            );
            await reportarErro({
              origem: "webhook/pagamento:valor-menor",
              erro: "valor pago menor que o total do pedido",
              extra: { tenantId, orderId: result.orderId, pagoCentavos: result.amountCents },
            });
            return;
          }
        }
        const pago = await prisma.order.updateMany({
          where: { id: result.orderId, paymentStatus: "UNPAID" },
          data: { paymentStatus: "PAID", mpPaymentId: result.providerPaymentId },
        });
        // Só PENDING vira CONFIRMED. Um approved atrasado não pode puxar para
        // trás pedido que a cozinha já levou adiante, nem reabrir um cancelado.
        const confirmado = await prisma.order.updateMany({
          where: { id: result.orderId, status: "PENDING" },
          data: { status: "CONFIRMED" },
        });
        mudou = pago.count > 0 || confirmado.count > 0;
      } else if (result.status === "refunded") {
        const estornado = await prisma.order.updateMany({
          where: { id: result.orderId, paymentStatus: "PAID" },
          data: { paymentStatus: "REFUNDED" },
        });
        mudou = estornado.count > 0;
      }
      // rejected e cancelled não escrevem: pedido UNPAID já está como o evento
      // diz, e uma recusa que chega depois da aprovação (tentativa anterior do
      // mesmo pedido) despagaria um pedido que o cliente de fato pagou.

      if (mudou) {
        const order = await prisma.order.findFirst({
          where: { id: result.orderId },
        });
        if (order) {
          // Dinheiro entrou num pedido que já tinha sido cancelado (cobrança
          // que estourou o timeout e foi criada no gateway mesmo assim). Não
          // reabrimos o pedido, mas alguém precisa estornar: este log é o
          // rastro, e o alvo de qualquer alerta futuro.
          if (result.status === "approved" && order.status === "CANCELLED") {
            console.error(
              `[webhook/pagamento] pagamento aprovado em pedido CANCELADO, estornar: ` +
                `tenant=${tenantId} order=${order.id} payment=${result.providerPaymentId}`
            );
            await reportarErro({
              origem: "webhook/pagamento:aprovado-em-cancelado",
              erro: "pagamento aprovado em pedido cancelado, estornar",
              extra: { tenantId, orderId: order.id, paymentId: result.providerPaymentId },
            });
          }
          await broadcastOrderUpdate(tenantId, order);
        }
      }
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    // Qualquer falha genérica (ex.: blob de credenciais corrompido ou chave
    // de criptografia rotacionada, que faz decryptCredentials lançar Error
    // comum) precisa virar 500 — nunca 200. Reportar "received" pro gateway
    // quando na verdade falhamos esconderia um problema real.
    console.error("Webhook error:", extractErrorMessage(err));
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}

// O gateway manda GET pra validar a URL de notificação.
export async function GET() {
  return NextResponse.json({ ok: true });
}
