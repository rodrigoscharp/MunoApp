import { NextRequest, NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { criarLimitador } from "@/lib/rate-limit";
import { assinaturaTemPagamentoConfirmado } from "@/lib/assinatura/asaas";
import { provisionarInscricao } from "@/lib/assinatura/provisionamento";
import { buildTenantBaseUrl } from "@/lib/tenant-provisioning";

/**
 * O caminho rápido do provisionamento, disparado pela volta do cliente do
 * gateway (/assinar/obrigado?i=…).
 *
 * O webhook do Asaas continua sendo o caminho normal e o job diário a rede de
 * segurança. Esta rota existe para o meio-termo: quando o webhook não chega,
 * quem acabou de pagar não deveria esperar até a próxima passada do cron para
 * ter o restaurante — e ele está bem ali, na página de obrigado, no instante
 * em que o pagamento acabou de confirmar.
 *
 * O ID NA URL NÃO AUTORIZA NADA. Ele só diz qual inscrição verificar; quem
 * decide se provisiona é o Asaas, consultado deste lado. Por isso receber um
 * id vindo do navegador é seguro aqui — o pior que alguém faz sondando ids é
 * gastar a própria cota do limitador.
 *
 * Nunca responde erro para o cliente. Falha de gateway, id desconhecido ou
 * pagamento não confirmado dão todos o mesmo "ainda não": a página tem uma
 * mensagem honesta para esse caso, e o job diário continua atrás.
 */
const limitador = criarLimitador({ max: 10, janelaMs: 10 * 60 * 1000 });

/** O mesmo "ainda não" para todos os desfechos que não são sucesso. */
const aindaNao = () => NextResponse.json({ provisionada: false });

export async function POST(req: NextRequest) {
  const corpo = (await req.json().catch(() => null)) as {
    inscricaoId?: unknown;
  } | null;
  const inscricaoId = corpo?.inscricaoId;
  if (typeof inscricaoId !== "string" || inscricaoId.length === 0) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  // Depois da validação, pelo mesmo motivo de /api/assinar: corpo malformado
  // não custa banco nem gateway, e não deve gastar a cota de quem acabou de
  // pagar.
  const ip = (req.headers.get("x-forwarded-for") ?? "desconhecido")
    .split(",")[0]
    .trim();
  if (!limitador.permitir(ip, Date.now())) {
    return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 });
  }

  const inscricao = await prismaUnscoped.inscricao.findUnique({
    where: { id: inscricaoId },
  });

  // Não confirma nem nega a existência do id: quem sondar não aprende nada, e
  // o desfecho para o cliente é o mesmo da página sem parâmetro.
  if (!inscricao) return aindaNao();

  // O webhook chegou primeiro — o caso comum. Mesmo desfecho bom, sem
  // consultar o gateway nem tentar provisionar de novo.
  if (inscricao.status === "PROVISIONADA") {
    return NextResponse.json({
      provisionada: true,
      url: buildTenantBaseUrl(inscricao.slug),
    });
  }

  if (!inscricao.asaasSubscriptionId) return aindaNao();

  try {
    const pago = await assinaturaTemPagamentoConfirmado(
      inscricao.asaasSubscriptionId
    );
    if (!pago) return aindaNao();

    await provisionarInscricao(inscricao, { origem: "assinar/reconciliar" });

    console.error(
      `[assinar/reconciliar] Inscricao ${inscricao.id} (slug ${inscricao.slug}) ` +
        `provisionada pela volta do cliente, não pelo webhook. ` +
        `A entrega do Asaas não chegou a tempo: verificar a fila.`
    );

    return NextResponse.json({
      provisionada: true,
      url: buildTenantBaseUrl(inscricao.slug),
    });
  } catch (erro) {
    // O job diário ainda vai pegar. A página não pode quebrar por isto.
    console.error(
      `[assinar/reconciliar] Falha ao reconciliar a Inscricao ${inscricao.id} — ` +
        `fica para o job diário`,
      erro
    );
    return aindaNao();
  }
}
