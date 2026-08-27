import { NextRequest, NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { webhookAutorizado } from "@/lib/assinatura/asaas";
import { provisionTenant, ProvisionError } from "@/lib/tenant-provisioning";
import { PRECOS } from "@/lib/plans";
import { competenciaDe, DIA_VENCIMENTO_MAX } from "@/lib/assinatura/competencia";
import { enviarBoasVindas } from "@/lib/assinatura/email-boas-vindas";

/**
 * Webhook chamado pelo Asaas quando um pagamento da PLATAFORMA (a Muno
 * cobrando o restaurante pela assinatura, não o restaurante cobrando o
 * cliente dele) muda de status. É este handler que transforma um pagamento
 * confirmado em restaurante provisionado.
 *
 * Roda sozinho, sem ninguém olhando, e o Asaas reentrega a mesma chamada
 * enquanto não receber 200 — para sempre. Três consequências que moldam o
 * arquivo inteiro:
 *
 * 1. Responder sempre 200, exceto token inválido, para os ramos de
 *    ROTEAMENTO: evento que não é nosso, pagamento que não casa com
 *    nenhuma Inscricao, Inscricao já provisionada. Um 404 ou 500 nesses
 *    casos vira reentrega infinita de um evento que nunca vai mudar de
 *    resultado.
 * 2. Falha genuína de processamento (banco caiu no meio, etc.) DEVE
 *    propagar sem virar 200 — é o oposto do item 1. É a reentrega do Asaas
 *    que dá a segunda chance de terminar o trabalho, e só faz sentido se a
 *    reentrega puder ter sucesso (ver o item 3).
 * 3. Por isso cada coisa que passa a existir no mundo tem seu vínculo
 *    gravado antes do passo seguinte: uma entrega que morre no meio precisa
 *    deixar rastro suficiente para a próxima retomar de onde parou, em vez
 *    de recomeçar do zero e bater num estado que ela mesma criou (tenant
 *    com o slug já usado, assinatura com o asaasSubscriptionId já usado).
 *    Quando o próprio registro do vínculo é o passo que falha (o tenant
 *    nasceu, mas o `inscricao.update` que grava o tenantId não chegou a
 *    rodar), a retomada recupera o tenant pelo slug — ver o comentário no
 *    `catch` de SLUG_EM_USO abaixo para o porquê disso ser seguro.
 *
 * O e-mail de boas-vindas (enviarBoasVindas) sai depois da transação, em
 * try/catch que não propaga — ver o comentário logo antes da chamada, no
 * fim do handler.
 */

// PAYMENT_CREATED e PAYMENT_OVERDUE espelham cobrança de assinatura já
// existente e pertencem à renovação (job de cron), não ao provisionamento.
// Este handler só sabe fazer uma coisa: nascer um restaurante a partir de um
// pagamento confirmado.
const PAGOS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);

/** Valor que nenhum id real assume — placeholder do OR abaixo. */
const SENTINELA = "__nenhum__";

/** Sempre 200: o Asaas reentrega enquanto não receber, para sempre. */
const ok = () => NextResponse.json({ ok: true });

export async function POST(req: NextRequest) {
  if (!webhookAutorizado(req.headers.get("asaas-access-token"))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const corpo = (await req.json().catch(() => null)) as {
    event?: string;
    payment?: {
      id?: string;
      value?: number;
      subscription?: string;
      externalReference?: string;
    };
  } | null;

  const evento = corpo?.event;
  const pagamento = corpo?.payment;
  if (!evento || !pagamento) return ok();

  // Evento que este handler não sabe tratar: 200 e sai, para não virar
  // reentrega infinita de algo que nunca vai mudar de resultado.
  if (!PAGOS.has(evento)) return ok();

  // A busca tem três campos em OR, e a ORDEM importa:
  //
  // 1. id: pagamento.externalReference — a rede de segurança. A rota de
  //    checkout (/api/assinar) grava nele o id da própria Inscricao, então
  //    mesmo que os ids do Asaas não tenham chegado a ser gravados
  //    localmente (uma falha entre criar a assinatura no Asaas e gravar o
  //    id de volta na Inscricao), o webhook ainda acha o registro certo.
  //    Isto não é redundância com os dois campos abaixo — é o que impede
  //    "cliente pagou e ninguém sabe". Não simplifique para um campo só.
  // 2. asaasPaymentId — casa pelo id do pagamento específico.
  // 3. asaasSubscriptionId — casa pelo id da assinatura, para o caso de o
  //    evento não trazer (ou não ter sido gravado) o id do pagamento.
  //
  // O `?? SENTINELA` em cada campo evita `{ asaasPaymentId: undefined }` no
  // OR: um valor undefined pode casar de forma indesejada no Prisma, e um
  // valor sentinela impossível ("__nenhum__") não casa com nada de verdade.
  const inscricao = await prismaUnscoped.inscricao.findFirst({
    where: {
      OR: [
        { id: pagamento.externalReference ?? SENTINELA },
        { asaasPaymentId: pagamento.id ?? SENTINELA },
        { asaasSubscriptionId: pagamento.subscription ?? SENTINELA },
      ],
    },
  });

  // Pagamento que não é de uma inscrição nossa. 200, e não 404: um 404 faria
  // o Asaas reentregar para sempre um evento que nunca vai casar.
  if (!inscricao) return ok();

  // Idempotência. O Asaas reentrega quando não recebe 200 — sem esta linha,
  // a segunda entrega cria um segundo restaurante para quem pagou uma vez.
  if (inscricao.status === "PROVISIONADA") return ok();

  const agora = new Date();

  // Retomada. Se a Inscricao já tem tenantId, uma entrega anterior já criou
  // o tenant e morreu antes de terminar o resto (a transação abaixo). Chamar
  // provisionTenant de novo bateria no SLUG_EM_USO do próprio tenant que
  // estamos tentando terminar de configurar — e o Asaas reentregaria esse
  // erro para sempre, sem nunca conseguir progredir.
  let tenantId: string;
  if (inscricao.tenantId) {
    const tenant = await prismaUnscoped.tenant.findUnique({
      where: { id: inscricao.tenantId },
    });
    if (!tenant) {
      // Estado que não deveria existir (o tenant apontado sumiu), mas se
      // existir precisa parar tudo em vez de tentar provisionar um segundo
      // tenant por cima — propaga, e não vira 200 disfarçado.
      throw new Error(
        `Inscricao ${inscricao.id} aponta para o tenant ${inscricao.tenantId}, que não existe mais.`
      );
    }
    tenantId = tenant.id;
  } else {
    // provisionTenant já é transacional, já cria o Setting de identidade, e
    // já traduz P2002 (slug em uso) para um erro específico — reaproveitado
    // inteiro, sem caminho novo de criação de tenant.
    let tenant: { id: string };
    try {
      const resultado = await provisionTenant({
        nome: inscricao.nome,
        slug: inscricao.slug,
        email: inscricao.email,
        plano: inscricao.plano,
      });
      tenant = resultado.tenant;
    } catch (erro) {
      if (!(erro instanceof ProvisionError) || erro.code !== "SLUG_EM_USO") {
        // SLUG_INVALIDO, SLUG_RESERVADO ou qualquer outro erro: não é
        // retomada, é dado ruim (ou falha real de infraestrutura).
        // Reentregar não conserta dado ruim — propaga.
        throw erro;
      }

      // Retomada de uma janela mais estreita que a de cima: o tenant NASCEU
      // numa tentativa anterior, mas o `inscricao.update` que grava o
      // tenantId (logo abaixo) falhou em seguida — conexão caiu, timeout, o
      // que for. Nesse instante o tenant existe e inscricao.tenantId
      // continua null, então a reentrega cai neste `else` de novo, chama
      // provisionTenant de novo, e ele vê o slug já ocupado.
      //
      // Recuperar por slug aqui é seguro, e não um jeitinho perigoso: o
      // slug é único tanto em Tenant quanto em Inscricao
      // (Inscricao.slug @unique), e é ESTA inscrição que detém a reserva
      // dele. Enquanto essa reserva está de pé, nenhuma outra inscrição
      // consegue criar um tenant com o mesmo slug — então, se existe um
      // tenant com este slug, ele só pode ter nascido desta mesma
      // inscrição. Não há risco de adotar o restaurante de outro cliente.
      const tenantRecuperado = await prismaUnscoped.tenant.findUnique({
        where: { slug: inscricao.slug },
      });
      if (!tenantRecuperado) {
        // Estado impossível: provisionTenant disse que o slug está em uso,
        // mas não achamos o dono dele. Não inventa caminho — propaga o
        // SLUG_EM_USO original para 500 e investigação, não recuperação
        // silenciosa sobre uma premissa que já provou estar errada.
        throw erro;
      }
      tenant = tenantRecuperado;
    }

    tenantId = tenant.id;

    // Grava o vínculo NA HORA em que o tenant passa a existir (criado ou
    // recuperado), antes de qualquer escrita seguinte. É isto que faz uma
    // entrega que morrer daqui em diante ser retomada pelo ramo de cima, em
    // vez de tentar criar (ou recuperar) de novo.
    await prismaUnscoped.inscricao.update({
      where: { id: inscricao.id },
      data: { tenantId },
    });
  }

  // diaVencimento sai do dia do pagamento, com teto de 28 (DIA_VENCIMENTO_MAX)
  // — não existe mês sem dia 28, então nenhum vencimento cai em data
  // inexistente.
  const diaVencimento = Math.min(agora.getUTCDate(), DIA_VENCIMENTO_MAX);

  // Tudo daqui para a frente é uma transação: a Assinatura, a Cobranca, o
  // status PROVISIONADA e o vínculo do Lead saem juntos, ou nenhum sai. Uma
  // reentrega só encontra dois estados possíveis — nada feito (repete tudo)
  // ou tudo feito (status já PROVISIONADA, barrado lá em cima) — nunca a
  // metade.
  //
  // provisionTenant tem a própria transação e não entra nesta: são dois
  // passos distintos de propósito — o primeiro cria o restaurante, o
  // segundo registra a relação comercial dele com a plataforma.
  await prismaUnscoped.$transaction(async (tx) => {
    // Idempotente: se uma entrega concorrente ou uma tentativa anterior já
    // criou a Assinatura deste tenant, reaproveita em vez de tentar criar
    // outra e bater no @unique de asaasSubscriptionId.
    const assinaturaExistente = await tx.assinatura.findUnique({
      where: { tenantId },
    });
    const assinatura =
      assinaturaExistente ??
      (await tx.assinatura.create({
        data: {
          tenantId,
          // valorMensal é sempre o valor de UM mês, inclusive no anual: é o
          // número que o CRM mostra. O total pago do ano vive só na
          // Cobranca abaixo.
          valorMensal: PRECOS[inscricao.plano].mensalCentavos / 100,
          diaVencimento,
          inicioCobranca: agora,
          ciclo: inscricao.ciclo,
          // Sempre presente: os dois ciclos criam assinatura no Asaas (ver
          // src/lib/assinatura/asaas.ts). É este id que faz o job diário
          // (src/app/api/cron/assinaturas/route.ts) pular a geração de
          // cobrança para este cliente — sem ele, o cron cria uma segunda
          // dívida que o Asaas nunca baixa, e a régua bloqueia em 15 dias
          // um cliente adimplente.
          asaasSubscriptionId: inscricao.asaasSubscriptionId,
        },
      }));

    // A Cobranca nasce PAGA, espelhando o pagamento que acabou de
    // confirmar. É isto que mantém a régua, o proxy e o CRM funcionando sem
    // saber que existe gateway.
    await tx.cobranca.create({
      data: {
        assinaturaId: assinatura.id,
        competencia: competenciaDe(agora),
        valor: pagamento.value ?? PRECOS[inscricao.plano].mensalCentavos / 100,
        vencimento: agora,
        status: "PAGA",
        pagoEm: agora,
      },
    });

    await tx.inscricao.update({
      where: { id: inscricao.id },
      data: { status: "PROVISIONADA" },
    });

    // Fecha o Lead que a rota de checkout registrou, ligando-o ao tenant que
    // acabou de nascer. tenantId: null na cláusula porque um Lead já
    // vinculado a outro tenant não pode ser roubado por este e-mail
    // coincidir.
    await tx.lead.updateMany({
      where: { email: inscricao.email, origem: "checkout", tenantId: null },
      data: { tenantId, status: "FECHADO" },
    });
  });

  // E-mail de boas-vindas: a única coisa que o cliente recebe depois de
  // pagar. Fora da transação e em try/catch de propósito — o tenant já
  // existe e já está PROVISIONADA neste ponto, então um throw aqui faria o
  // Asaas reentregar um evento que a idempotência lá em cima (status já
  // PROVISIONADA) já barra: o restaurante ficaria criado e nenhum e-mail
  // jamais sairia, para sempre. Falha vira log com contexto suficiente para
  // reenviar manualmente pelo CRM.
  try {
    await enviarBoasVindas({
      tenantId,
      slug: inscricao.slug,
      email: inscricao.email,
      nome: inscricao.nome,
    });
  } catch (erro) {
    console.error(
      `[webhook/asaas] Falha ao enviar e-mail de boas-vindas — inscricao=${inscricao.id} slug=${inscricao.slug} email=${inscricao.email}`,
      erro
    );
  }

  return ok();
}
