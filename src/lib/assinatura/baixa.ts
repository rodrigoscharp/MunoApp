import { prismaUnscoped } from "@/lib/prisma";
import { statusPelaRegua, type StatusAssinatura } from "./regua";

/**
 * A baixa manual de uma cobrança.
 *
 * Enquanto não há gateway, é assim que o dinheiro entra no sistema: o operador
 * confere o PIX e dá baixa. Por isso a rota é fina e a decisão mora aqui —
 * este é o único caminho de código que devolve acesso a um restaurante
 * bloqueado, e ele precisa ser lido, testado e exercitado contra o banco de
 * verdade sem passar por uma sessão HTTP.
 *
 * O relógio é parâmetro, como no resto da régua.
 */

export type ResultadoDaBaixa =
  | { ok: false; motivo: "NAO_ENCONTRADA" }
  | { ok: false; motivo: "CANCELADA" }
  | {
      ok: true;
      cobranca: { id: string; status: "PAGA"; pagoEm: Date };
      assinatura: { id: string; status: StatusAssinatura };
    };

export async function darBaixa(
  cobrancaId: string,
  agora: Date
): Promise<ResultadoDaBaixa> {
  const cobranca = await prismaUnscoped.cobranca.findUnique({
    where: { id: cobrancaId },
    select: {
      id: true,
      status: true,
      pagoEm: true,
      assinaturaId: true,
      assinatura: { select: { id: true, status: true } },
    },
  });

  if (!cobranca) return { ok: false, motivo: "NAO_ENCONTRADA" };

  // Cancelar uma cobrança é decisão humana, tomada por algum motivo — desconto
  // combinado, mês de cortesia, erro de emissão. Aceitar baixa nela
  // ressuscitaria em silêncio uma dívida que a plataforma já tinha perdoado.
  if (cobranca.status === "CANCELADA") return { ok: false, motivo: "CANCELADA" };

  // Idempotência: dois cliques, ou dois operadores conferindo o mesmo PIX, não
  // podem empurrar o pagoEm para frente. A hora da primeira baixa é a hora em
  // que o dinheiro foi reconhecido, e é ela que vale no extrato do cliente.
  // O recálculo abaixo continua acontecendo de propósito: ele é convergente e,
  // se a primeira baixa morreu entre um UPDATE e outro, a segunda conserta.
  const pagoEm = cobranca.pagoEm ?? agora;
  if (cobranca.status !== "PAGA") {
    await prismaUnscoped.cobranca.update({
      where: { id: cobranca.id },
      data: { status: "PAGA", pagoEm },
    });
  }

  const statusDaAssinatura = await recalcularStatusDaAssinatura(
    cobranca.assinaturaId,
    cobranca.assinatura.status,
    agora
  );

  return {
    ok: true,
    cobranca: { id: cobranca.id, status: "PAGA", pagoEm },
    assinatura: { id: cobranca.assinaturaId, status: statusDaAssinatura },
  };
}

/**
 * Reaplica a régua à assinatura depois da baixa, **derivando** o status do que
 * ficou em aberto em vez de assumir que pagar uma cobrança quita a conta.
 *
 * É aqui que um `update({ status: "ATIVA" })` erraria: quem devia dois meses e
 * pagou só o mais antigo continua 15+ dias atrasado no outro, e voltaria a ter
 * a gestão liberada sem ter se acertado. A régua olha a cobrança em aberto
 * mais antiga que sobrou — a mesma fonte que o job diário usa, para as duas
 * não divergirem.
 */
async function recalcularStatusDaAssinatura(
  assinaturaId: string,
  statusAtual: StatusAssinatura,
  agora: Date
): Promise<StatusAssinatura> {
  // Cancelamento é decisão humana; nem o job nem a baixa desfazem decisão
  // humana. Dar baixa numa fatura antiga não recontrata ninguém.
  if (statusAtual === "CANCELADA") return statusAtual;

  const maisAntiga = await prismaUnscoped.cobranca.findFirst({
    where: { assinaturaId, status: { in: ["PENDENTE", "VENCIDA"] } },
    orderBy: { vencimento: "asc" },
    select: { vencimento: true },
  });

  const novoStatus = statusPelaRegua(maisAntiga?.vencimento ?? null, agora);
  if (novoStatus === statusAtual) return statusAtual;

  await prismaUnscoped.assinatura.update({
    where: { id: assinaturaId },
    data: { status: novoStatus },
  });
  return novoStatus;
}
