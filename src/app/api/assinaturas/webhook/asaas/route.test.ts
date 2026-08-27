import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// --- mocks -------------------------------------------------------------
//
// webhookAutorizado NÃO é testado de novo aqui (Task 6 já cobre
// timingSafeEqual e falha fechada). O que esta rota precisa isolar é I/O —
// banco e o provisionamento do tenant.
//
// NÃO mockamos @/lib/assinatura/email-boas-vindas: esse módulo só nasce na
// Task 12, que também é quem liga a chamada dentro deste handler. Este
// arquivo não importa nem espera nenhum e-mail de boas-vindas.

const webhookAutorizado = vi.fn();
vi.mock("@/lib/assinatura/asaas", () => ({
  webhookAutorizado: (...args: unknown[]) => webhookAutorizado(...args),
}));

const inscricaoFindFirst = vi.fn();
// prismaUnscoped.inscricao.update: só a escrita FORA da transação, que grava
// o tenantId no instante em que o tenant nasce (antes de qualquer coisa
// depender dele). A escrita que marca PROVISIONADA é outra (tx.inscricao.update,
// abaixo) — separadas de propósito, para os testes de retomada distinguirem
// as duas.
const inscricaoUpdateTenantId = vi.fn();
// prismaUnscoped.tenant.findUnique: usado só na retomada, quando a Inscricao
// já chega com tenantId (uma entrega anterior já criou o tenant e morreu
// antes de terminar o resto).
const tenantFindUnique = vi.fn();
// Os quatro abaixo vivem dentro da transação (tx.*): ou saem juntos, ou
// nenhum sai.
const assinaturaFindUnique = vi.fn();
const assinaturaCreate = vi.fn();
const cobrancaCreate = vi.fn();
const inscricaoUpdateStatus = vi.fn();
const leadUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    inscricao: {
      findFirst: (...args: unknown[]) => inscricaoFindFirst(...args),
      update: (...args: unknown[]) => inscricaoUpdateTenantId(...args),
    },
    tenant: {
      findUnique: (...args: unknown[]) => tenantFindUnique(...args),
    },
    // Como em src/lib/tenant-provisioning.test.ts: $transaction chama o
    // callback direto com um objeto "tx" — sem simular rollback de verdade,
    // porque o que o handler precisa é que CADA escrita de dentro passe
    // pelos mocks certos, não a atomicidade real do Postgres.
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        assinatura: {
          findUnique: (...args: unknown[]) => assinaturaFindUnique(...args),
          create: (...args: unknown[]) => assinaturaCreate(...args),
        },
        cobranca: {
          create: (...args: unknown[]) => cobrancaCreate(...args),
        },
        inscricao: {
          update: (...args: unknown[]) => inscricaoUpdateStatus(...args),
        },
        lead: {
          updateMany: (...args: unknown[]) => leadUpdateMany(...args),
        },
      }),
  },
}));

const provisionTenant = vi.fn();
vi.mock("@/lib/tenant-provisioning", () => ({
  provisionTenant: (...args: unknown[]) => provisionTenant(...args),
}));

// PRECOS e competenciaDe/DIA_VENCIMENTO_MAX NÃO são mockados: são lógica pura
// (tabela de preços e cálculo de data), e testá-los de novo aqui duplicaria
// a cobertura de src/lib/plans.test.ts e competencia.test.ts.

const { POST } = await import("@/app/api/assinaturas/webhook/asaas/route");

// --- helpers -------------------------------------------------------------

function requisicao(corpo: unknown, token: string | null = "segredo-certo"): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers["asaas-access-token"] = token;
  return new NextRequest("http://localhost/api/assinaturas/webhook/asaas", {
    method: "POST",
    headers,
    body: JSON.stringify(corpo),
  });
}

function eventoPago(overrides: Record<string, unknown> = {}) {
  return {
    event: "PAYMENT_CONFIRMED",
    payment: {
      id: "pay_1",
      value: 119.99,
      subscription: "sub_1",
      externalReference: "insc-1",
      ...overrides,
    },
  };
}

function inscricaoAguardando(overrides: Record<string, unknown> = {}) {
  return {
    id: "insc-1",
    status: "AGUARDANDO_PAGAMENTO",
    slug: "pizzaria",
    nome: "Pizzaria",
    email: "a@b.c",
    plano: "MEMBRO",
    ciclo: "MENSAL",
    asaasSubscriptionId: "sub_1",
    tenantId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  webhookAutorizado.mockReturnValue(true);
  inscricaoFindFirst.mockResolvedValue(null);
  inscricaoUpdateTenantId.mockResolvedValue({});
  inscricaoUpdateStatus.mockResolvedValue({});
  tenantFindUnique.mockResolvedValue(null);
  provisionTenant.mockResolvedValue({
    tenant: { id: "tenant-1", slug: "pizzaria" },
    admin: { id: "admin-1" },
    url: "http://pizzaria.localhost:3000",
    senha: "descartada",
  });
  assinaturaFindUnique.mockResolvedValue(null);
  assinaturaCreate.mockResolvedValue({ id: "assinatura-1" });
  cobrancaCreate.mockResolvedValue({ id: "cobranca-1" });
  leadUpdateMany.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

// --- testes ----------------------------------------------------------------

describe("POST /api/assinaturas/webhook/asaas", () => {
  it("recusa token inválido com 401, sem tocar o banco", async () => {
    webhookAutorizado.mockReturnValue(false);

    const res = await POST(requisicao(eventoPago(), "errado"));

    expect(res.status).toBe(401);
    expect(inscricaoFindFirst).not.toHaveBeenCalled();
    expect(provisionTenant).not.toHaveBeenCalled();
  });

  it("corpo sem event/payment responde 200 sem consultar o banco", async () => {
    const res = await POST(requisicao({}));

    expect(res.status).toBe(200);
    expect(inscricaoFindFirst).not.toHaveBeenCalled();
  });

  // PAYMENT_CREATED e PAYMENT_OVERDUE espelham cobrança de assinatura já
  // existente e são tratados na renovação, não aqui. Sair com 200 sem nem
  // consultar a Inscricao evita reentrega infinita de um evento que este
  // handler não sabe (e não precisa) tratar.
  it.each(["PAYMENT_CREATED", "PAYMENT_OVERDUE", "SUBSCRIPTION_CREATED"])(
    "evento %s responde 200 sem consultar a Inscricao",
    async (event) => {
      const res = await POST(requisicao({ ...eventoPago(), event }));

      expect(res.status).toBe(200);
      expect(inscricaoFindFirst).not.toHaveBeenCalled();
      expect(provisionTenant).not.toHaveBeenCalled();
    }
  );

  // Pagamento que não casa com nenhuma Inscricao nossa: 200, e não 404 — um
  // 404 faria o Asaas reentregar para sempre um evento que nunca vai casar.
  it("evento de inscrição desconhecida responde 200 sem fazer nada", async () => {
    inscricaoFindFirst.mockResolvedValue(null);

    const res = await POST(requisicao(eventoPago()));

    expect(res.status).toBe(200);
    expect(provisionTenant).not.toHaveBeenCalled();
  });

  // A idempotência mora aqui: sem ela, a segunda entrega do mesmo webhook
  // cria um SEGUNDO restaurante para quem pagou uma vez só.
  it("entrega repetida (Inscricao já PROVISIONADA) responde 200 e não toca em nada", async () => {
    inscricaoFindFirst.mockResolvedValue({
      id: "insc-1",
      status: "PROVISIONADA",
      slug: "pizzaria",
      tenantId: "tenant-1",
    });

    const res = await POST(requisicao(eventoPago()));

    expect(res.status).toBe(200);
    expect(provisionTenant).not.toHaveBeenCalled();
    expect(tenantFindUnique).not.toHaveBeenCalled();
    expect(assinaturaCreate).not.toHaveBeenCalled();
    expect(cobrancaCreate).not.toHaveBeenCalled();
    expect(inscricaoUpdateTenantId).not.toHaveBeenCalled();
    expect(inscricaoUpdateStatus).not.toHaveBeenCalled();
    expect(leadUpdateMany).not.toHaveBeenCalled();
  });

  // A ordem importa: id (externalReference) primeiro, é a rede de segurança
  // que acha a Inscricao mesmo quando os ids do Asaas não chegaram a ser
  // gravados localmente. Sentinela em vez de undefined: um campo undefined
  // dentro do OR do Prisma pode casar de forma indesejada.
  it("busca a Inscricao por id, asaasPaymentId e asaasSubscriptionId nesta ordem, com sentinela para os ausentes", async () => {
    await POST(
      requisicao({
        event: "PAYMENT_CONFIRMED",
        payment: { id: "pay_1", externalReference: "insc-1" },
      })
    );

    expect(inscricaoFindFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { id: "insc-1" },
          { asaasPaymentId: "pay_1" },
          { asaasSubscriptionId: "__nenhum__" },
        ],
      },
    });
  });

  it("usa o sentinela para todo campo ausente do payload, nunca undefined", async () => {
    await POST(requisicao({ event: "PAYMENT_CONFIRMED", payment: {} }));

    const where = inscricaoFindFirst.mock.calls[0][0].where;
    for (const clausula of where.OR) {
      const valor = Object.values(clausula)[0];
      expect(valor).not.toBeUndefined();
    }
  });

  it("provisiona o tenant com os dados da Inscricao", async () => {
    inscricaoFindFirst.mockResolvedValue(inscricaoAguardando());

    const res = await POST(requisicao(eventoPago()));

    expect(res.status).toBe(200);
    expect(provisionTenant).toHaveBeenCalledOnce();
    expect(provisionTenant).toHaveBeenCalledWith({
      nome: "Pizzaria",
      slug: "pizzaria",
      email: "a@b.c",
      plano: "MEMBRO",
    });
  });

  it("cria a Assinatura com o asaasSubscriptionId da Inscricao — é ele que faz o cron pular a cobrança deste cliente", async () => {
    inscricaoFindFirst.mockResolvedValue(inscricaoAguardando());

    await POST(requisicao(eventoPago()));

    expect(assinaturaCreate).toHaveBeenCalledOnce();
    const dados = assinaturaCreate.mock.calls[0][0].data;
    expect(dados.tenantId).toBe("tenant-1");
    expect(dados.asaasSubscriptionId).toBe("sub_1");
    expect(dados.ciclo).toBe("MENSAL");
  });

  // valorMensal é sempre o valor de UM mês, inclusive no ciclo anual: é o
  // número que o CRM mostra. O total pago do ano vive só na Cobranca.
  it("valorMensal é o preço de um mês mesmo quando a Inscricao é anual", async () => {
    inscricaoFindFirst.mockResolvedValue(
      inscricaoAguardando({ ciclo: "ANUAL" })
    );

    await POST(requisicao(eventoPago()));

    const dados = assinaturaCreate.mock.calls[0][0].data;
    // PRECOS.MEMBRO.mensalCentavos = 11999 centavos = 119.99 reais.
    expect(dados.valorMensal).toBe(119.99);
  });

  it("diaVencimento sai do dia do pagamento, com teto de 28 (DIA_VENCIMENTO_MAX)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 31))); // 31 de agosto
    inscricaoFindFirst.mockResolvedValue(inscricaoAguardando());

    await POST(requisicao(eventoPago()));

    const dados = assinaturaCreate.mock.calls[0][0].data;
    expect(dados.diaVencimento).toBe(28);
  });

  it("diaVencimento respeita o dia do pagamento quando ele já é <= 28", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 15))); // 15 de agosto
    inscricaoFindFirst.mockResolvedValue(inscricaoAguardando());

    await POST(requisicao(eventoPago()));

    const dados = assinaturaCreate.mock.calls[0][0].data;
    expect(dados.diaVencimento).toBe(15);
  });

  it("cria a Cobranca já PAGA, espelhando o pagamento confirmado", async () => {
    inscricaoFindFirst.mockResolvedValue(inscricaoAguardando());

    await POST(requisicao(eventoPago({ value: 119.99 })));

    expect(cobrancaCreate).toHaveBeenCalledOnce();
    const dados = cobrancaCreate.mock.calls[0][0].data;
    expect(dados.assinaturaId).toBe("assinatura-1");
    expect(dados.status).toBe("PAGA");
    expect(dados.valor).toBe(119.99);
    expect(dados.pagoEm).toBeInstanceOf(Date);
    expect(dados.competencia).toMatch(/^\d{4}-\d{2}$/);
  });

  it("cobranca cai para o preço do plano quando o payload não traz value", async () => {
    inscricaoFindFirst.mockResolvedValue(inscricaoAguardando());

    await POST(
      requisicao({
        event: "PAYMENT_CONFIRMED",
        payment: { id: "pay_1", subscription: "sub_1", externalReference: "insc-1" },
      })
    );

    const dados = cobrancaCreate.mock.calls[0][0].data;
    expect(dados.valor).toBe(119.99);
  });

  // O vínculo é gravado em dois momentos diferentes, de propósito: o
  // tenantId assim que o tenant nasce (fora da transação, antes de qualquer
  // coisa depender dele), o status PROVISIONADA só no fim, depois que
  // Assinatura, Cobranca e Lead já saíram juntos na mesma transação.
  it("grava o tenantId assim que o tenant nasce, e só marca PROVISIONADA depois de tudo mais pronto", async () => {
    inscricaoFindFirst.mockResolvedValue(inscricaoAguardando());

    await POST(requisicao(eventoPago()));

    expect(inscricaoUpdateTenantId).toHaveBeenCalledWith({
      where: { id: "insc-1" },
      data: { tenantId: "tenant-1" },
    });
    expect(inscricaoUpdateStatus).toHaveBeenCalledWith({
      where: { id: "insc-1" },
      data: { status: "PROVISIONADA" },
    });
  });

  it("fecha o Lead do checkout, ligando-o ao tenant recém-criado", async () => {
    inscricaoFindFirst.mockResolvedValue(inscricaoAguardando());

    await POST(requisicao(eventoPago()));

    expect(leadUpdateMany).toHaveBeenCalledWith({
      where: { email: "a@b.c", origem: "checkout", tenantId: null },
      data: { tenantId: "tenant-1", status: "FECHADO" },
    });
  });

  // Aceita tanto PAYMENT_CONFIRMED quanto PAYMENT_RECEIVED: o Asaas manda os
  // dois conforme o meio de pagamento, e os dois significam "o dinheiro
  // entrou".
  it("também provisiona em PAYMENT_RECEIVED", async () => {
    inscricaoFindFirst.mockResolvedValue(inscricaoAguardando());

    const res = await POST(
      requisicao({ ...eventoPago(), event: "PAYMENT_RECEIVED" })
    );

    expect(res.status).toBe(200);
    expect(provisionTenant).toHaveBeenCalledOnce();
  });

  it("caminho feliz cria exatamente um tenant, uma assinatura e uma cobrança PAGA", async () => {
    inscricaoFindFirst.mockResolvedValue(inscricaoAguardando());

    const res = await POST(requisicao(eventoPago()));

    expect(res.status).toBe(200);
    expect(provisionTenant).toHaveBeenCalledOnce();
    expect(assinaturaCreate).toHaveBeenCalledOnce();
    expect(cobrancaCreate).toHaveBeenCalledOnce();
    expect(cobrancaCreate.mock.calls[0][0].data.status).toBe("PAGA");
  });

  // --- retomada: a mesma classe de bug corrigida duas vezes neste plano —
  // o vínculo precisa ser gravado no instante em que a coisa passa a
  // existir, senão a reentrega recomeça do zero e bate num estado que ela
  // mesma criou. ---

  it("entrega que morre logo após provisionTenant: a reentrega acha o tenant pelo tenantId, sem chamar provisionTenant de novo", async () => {
    inscricaoFindFirst.mockResolvedValue(inscricaoAguardando({ tenantId: null }));
    // Simula a entrega morrendo assim que a transação ia começar — depois
    // de provisionTenant e do update que grava o tenantId, mas antes de
    // qualquer escrita da Assinatura.
    const erroDeInfra = new Error("banco caiu bem quando a transação ia começar");
    assinaturaFindUnique.mockRejectedValueOnce(erroDeInfra);

    // Falha de processamento genuína: propaga (não vira 200 disfarçado —
    // é o que dá ao Asaas o motivo de reentregar).
    await expect(POST(requisicao(eventoPago()))).rejects.toThrow(
      "banco caiu bem quando a transação ia começar"
    );

    expect(provisionTenant).toHaveBeenCalledOnce();
    // O vínculo já foi gravado antes da falha — é o que torna a retomada
    // possível.
    expect(inscricaoUpdateTenantId).toHaveBeenCalledWith({
      where: { id: "insc-1" },
      data: { tenantId: "tenant-1" },
    });

    // Reentrega do Asaas: a Inscricao já chega com tenantId gravado, e a
    // Assinatura ainda não existia quando a primeira tentativa morreu.
    provisionTenant.mockClear();
    inscricaoFindFirst.mockResolvedValue(
      inscricaoAguardando({ tenantId: "tenant-1" })
    );
    tenantFindUnique.mockResolvedValue({ id: "tenant-1", slug: "pizzaria" });
    assinaturaFindUnique.mockResolvedValue(null);

    const res = await POST(requisicao(eventoPago()));

    expect(res.status).toBe(200);
    expect(provisionTenant).not.toHaveBeenCalled();
    expect(tenantFindUnique).toHaveBeenCalledWith({ where: { id: "tenant-1" } });
    expect(assinaturaCreate).toHaveBeenCalledOnce();
  });

  it("entrega que morre logo após assinatura.create: a reentrega não cria outra assinatura e completa", async () => {
    inscricaoFindFirst.mockResolvedValue(inscricaoAguardando({ tenantId: null }));
    assinaturaFindUnique.mockResolvedValue(null);
    assinaturaCreate.mockResolvedValue({ id: "assinatura-1" });
    // A Assinatura já foi criada quando a entrega morre — o teto do
    // @unique(asaasSubscriptionId) é justamente o que bate se a reentrega
    // tentar criar outra.
    const erroDeInfra = new Error("conexão caiu logo depois de criar a assinatura");
    cobrancaCreate.mockRejectedValueOnce(erroDeInfra);

    await expect(POST(requisicao(eventoPago()))).rejects.toThrow(
      "conexão caiu logo depois de criar a assinatura"
    );
    expect(assinaturaCreate).toHaveBeenCalledOnce();

    // Reentrega: tenantId já gravado, Assinatura já existe.
    assinaturaCreate.mockClear();
    cobrancaCreate.mockResolvedValue({ id: "cobranca-1" });
    assinaturaFindUnique.mockResolvedValue({ id: "assinatura-1", tenantId: "tenant-1" });
    tenantFindUnique.mockResolvedValue({ id: "tenant-1", slug: "pizzaria" });
    inscricaoFindFirst.mockResolvedValue(
      inscricaoAguardando({ tenantId: "tenant-1" })
    );

    const res = await POST(requisicao(eventoPago()));

    expect(res.status).toBe(200);
    expect(assinaturaCreate).not.toHaveBeenCalled();
    expect(cobrancaCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assinaturaId: "assinatura-1" }),
      })
    );
    expect(inscricaoUpdateStatus).toHaveBeenCalledWith({
      where: { id: "insc-1" },
      data: { status: "PROVISIONADA" },
    });
  });

  it("Inscricao aponta para um tenant que não existe mais: a falha propaga, não vira 200 silencioso", async () => {
    inscricaoFindFirst.mockResolvedValue(
      inscricaoAguardando({ tenantId: "tenant-fantasma" })
    );
    tenantFindUnique.mockResolvedValue(null);

    await expect(POST(requisicao(eventoPago()))).rejects.toThrow(
      /tenant-fantasma/
    );
    expect(provisionTenant).not.toHaveBeenCalled();
  });
});
