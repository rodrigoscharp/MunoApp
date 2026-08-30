import type { Inscricao } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import { provisionTenant, ProvisionError } from "@/lib/tenant-provisioning";
import { PRECOS } from "@/lib/plans";
import { competenciaDe, DIA_VENCIMENTO_MAX } from "@/lib/assinatura/competencia";
import { enviarBoasVindas } from "@/lib/assinatura/email-boas-vindas";
import { registrarEvento } from "@/lib/funil/registrar";

/**
 * Transforma uma Inscricao paga em restaurante no ar.
 *
 * Vive aqui, e não dentro do handler do webhook, porque TEM DOIS CHAMADORES e
 * eles precisam se comportar igual: a entrega do Asaas (caminho normal) e a
 * reconciliação do job diário (rede de segurança para quando a entrega não
 * chega). Duplicar esta lógica seria duplicar cada uma das retomadas abaixo —
 * e é exatamente numa retomada divergente que nasceria o segundo restaurante
 * para quem pagou uma vez.
 *
 * Idempotente por construção. Quem chama é responsável por não invocá-la para
 * uma Inscricao já PROVISIONADA; daqui para dentro, cada passo grava o próprio
 * vínculo antes do seguinte, de modo que uma execução que morra no meio seja
 * retomável pela próxima sem recomeçar do zero.
 *
 * `valorPago` é o valor que o gateway confirmou. Ausente, cai na mensalidade
 * do plano — a Cobranca precisa nascer com algum valor, e o do plano é o
 * único palpite honesto.
 *
 * `origem` só entra nas mensagens de log, para se saber qual dos dois
 * caminhos escreveu a linha.
 */
export async function provisionarInscricao(
  inscricao: Inscricao,
  { valorPago, origem }: { valorPago?: number | null; origem: string }
): Promise<{ tenantId: string }> {
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
        valor: valorPago ?? PRECOS[inscricao.plano].mensalCentavos / 100,
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
    //
    // UM lead, e não updateMany: Lead.tenantId é @unique — a relação é 1:1.
    // Marcar vários leads com o mesmo tenant viola a constraint, derruba esta
    // transação inteira, e a Inscricao nunca chega a PROVISIONADA. O Asaas
    // então reentrega para sempre um erro que nunca vai passar, com o cliente
    // pago e o restaurante existindo sem assinatura.
    //
    // E basta o mesmo e-mail ter dois checkouts para cair nisso: alguém que
    // abandonou uma vez e voltou depois deixa dois leads em aberto. O mais
    // recente é o da tentativa que de fato converteu.
    const lead = await tx.lead.findFirst({
      where: { email: inscricao.email, origem: "checkout", tenantId: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (lead) {
      await tx.lead.update({
        where: { id: lead.id },
        data: { tenantId, status: "FECHADO" },
      });
    }

    // Os OUTROS leads do mesmo e-mail também fecham — sem vínculo.
    //
    // Quem preencheu o formulário da landing, conversou no WhatsApp e só
    // depois comprou pelo checkout deixa dois leads: um com origem "landing"
    // e outro com origem "checkout". Fechar só o do checkout deixava o outro
    // NOVO para sempre, e o CRM mostrava oportunidade em aberto de quem já é
    // cliente pagante.
    //
    // Sem tenantId porque Lead.tenantId é @unique: um tenant só pode ter um
    // lead vinculado, e esse é o do checkout, o da conversão. Os demais viram
    // histórico fechado, não vínculo.
    //
    // motivoPerda volta a null porque um lead marcado PERDIDO que depois
    // converteu é um negócio GANHO — manter o motivo da perda numa
    // oportunidade fechada seria dado contraditório no funil.
    await tx.lead.updateMany({
      where: {
        email: inscricao.email,
        tenantId: null,
        status: { not: "FECHADO" },
        ...(lead ? { id: { not: lead.id } } : {}),
      },
      data: { status: "FECHADO", motivoPerda: null },
    });

    // Dentro da transação, ao contrário dos outros eventos. Aqui o evento é
    // parte do mesmo fato atômico que a Assinatura, a Cobranca e o status
    // PROVISIONADA: um provisionamento que aconteceu e não aparece no funil
    // seria um cliente sem origem, e a reentrega do Asaas não o traria de
    // volta, porque a idempotência lá em cima já a barra.
    await registrarEvento(tx, {
      sessaoId: inscricao.sessaoId,
      tipo: "PROVISIONADO",
      detalhe: inscricao.plano,
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
      `[${origem}] Falha ao enviar e-mail de boas-vindas — inscricao=${inscricao.id} slug=${inscricao.slug} email=${inscricao.email}`,
      erro
    );
  }


  return { tenantId };
}
