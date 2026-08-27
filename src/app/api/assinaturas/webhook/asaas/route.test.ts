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
const inscricaoUpdate = vi.fn();
const assinaturaCreate = vi.fn();
const cobrancaCreate = vi.fn();
const leadUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    inscricao: {
      findFirst: (...args: unknown[]) => inscricaoFindFirst(...args),
      update: (...args: unknown[]) => inscricaoUpdate(...args),
    },
    assinatura: {
      create: (...args: unknown[]) => assinaturaCreate(...args),
    },
    cobranca: {
      create: (...args: unknown[]) => cobrancaCreate(...args),
    },
    lead: {
      updateMany: (...args: unknown[]) => leadUpdateMany(...args),
    },
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  webhookAutorizado.mockReturnValue(true);
  inscricaoFindFirst.mockResolvedValue(null);
  inscricaoUpdate.mockResolvedValue({});
  provisionTenant.mockResolvedValue({
    tenant: { id: "tenant-1", slug: "pizzaria" },
    admin: { id: "admin-1" },
    url: "http://pizzaria.localhost:3000",
    senha: "descartada",
  });
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
  it("entrega repetida (Inscricao já PROVISIONADA) responde 200 e não provisiona de novo", async () => {
    inscricaoFindFirst.mockResolvedValue({
      id: "insc-1",
      status: "PROVISIONADA",
      slug: "pizzaria",
    });

    const res = await POST(requisicao(eventoPago()));

    expect(res.status).toBe(200);
    expect(provisionTenant).not.toHaveBeenCalled();
    expect(assinaturaCreate).not.toHaveBeenCalled();
    expect(cobrancaCreate).not.toHaveBeenCalled();
    expect(inscricaoUpdate).not.toHaveBeenCalled();
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

  it("marca a Inscricao como PROVISIONADA e grava o tenantId", async () => {
    inscricaoFindFirst.mockResolvedValue(inscricaoAguardando());

    await POST(requisicao(eventoPago()));

    expect(inscricaoUpdate).toHaveBeenCalledWith({
      where: { id: "insc-1" },
      data: { tenantId: "tenant-1", status: "PROVISIONADA" },
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

  it("responde 200 no fluxo completo de provisionamento", async () => {
    inscricaoFindFirst.mockResolvedValue(inscricaoAguardando());

    const res = await POST(requisicao(eventoPago()));

    expect(res.status).toBe(200);
  });
});
