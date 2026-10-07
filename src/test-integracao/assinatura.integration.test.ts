/**
 * O ciclo da assinatura recorrente sobre o banco real: o espelho do Asaas, a
 * régua e o bloqueio, com as constraints únicas valendo de verdade.
 */
import crypto from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import { espelharEventoDeAssinatura } from "@/lib/assinatura/espelho";
import { POST as webhookDoAsaas } from "@/app/api/assinaturas/webhook/asaas/route";
import { criarTenant, limparTenants } from "./apoio";

// Quinta-feira, 20/11/2026.
const AGORA = new Date("2026-11-20T12:00:00Z");

let assinaturaId: string;
let sub: string;

async function novaAssinatura(extra: Record<string, unknown> = {}) {
  const tenant = await criarTenant("ass");
  sub = `sub_${tenant.slug}`;
  const a = await prismaUnscoped.assinatura.create({
    data: {
      tenantId: tenant.id,
      valorMensal: 119.99,
      diaVencimento: 10,
      inicioCobranca: new Date("2026-10-10T00:00:00Z"),
      asaasSubscriptionId: sub,
      ...extra,
    },
  });
  assinaturaId = a.id;
  return a;
}

// O id do pagamento no Asaas é único no mundo, e a coluna é @unique: cada teste
// precisa dos seus, senão um herda a cobrança do outro.
const evento = (event: string, id: string, dueDate: string, value = 119.99) => ({
  event,
  payment: { id: `${sub}_${id}`, value, subscription: sub, dueDate },
});

const cobrancas = () =>
  prismaUnscoped.cobranca.findMany({ where: { assinaturaId }, orderBy: { vencimento: "asc" } });
const statusDaAssinatura = async () =>
  (await prismaUnscoped.assinatura.findUnique({ where: { id: assinaturaId } }))!.status;

beforeEach(async () => {
  await novaAssinatura();
});

afterAll(limparTenants);

describe("renovação, atraso e bloqueio", () => {
  it("cobrança criada, vencida e depois paga leva a assinatura de ATIVA a BLOQUEADA e de volta", async () => {
    // 12/11 (quinta) -> hoje 20/11: 8 dias corridos, 6 úteis. Só aviso.
    await espelharEventoDeAssinatura(evento("PAYMENT_CREATED", "pay_1", "2026-11-12"), AGORA);
    expect(await statusDaAssinatura()).toBe("INADIMPLENTE");

    await espelharEventoDeAssinatura(evento("PAYMENT_OVERDUE", "pay_1", "2026-11-12"), AGORA);
    expect((await cobrancas())[0].status).toBe("VENCIDA");

    // A fatura do mês anterior, ainda em aberto há mais de 10 dias úteis. Bloqueia.
    await espelharEventoDeAssinatura(evento("PAYMENT_OVERDUE", "pay_0", "2026-10-28"), AGORA);
    expect(await statusDaAssinatura()).toBe("BLOQUEADA");

    await espelharEventoDeAssinatura(evento("PAYMENT_RECEIVED", "pay_0", "2026-10-28"), AGORA);
    await espelharEventoDeAssinatura(evento("PAYMENT_RECEIVED", "pay_1", "2026-11-12"), AGORA);

    expect(await statusDaAssinatura()).toBe("ATIVA");
    expect((await cobrancas()).every((c) => c.status === "PAGA")).toBe(true);
  });

  it("evento repetido não duplica a cobrança", async () => {
    for (let i = 0; i < 3; i++) {
      await espelharEventoDeAssinatura(evento("PAYMENT_CREATED", "pay_1", "2026-12-10"), AGORA);
    }
    expect(await cobrancas()).toHaveLength(1);
  });

  it("dois eventos simultâneos da mesma cobrança: uma linha só, o outro cai no unique", async () => {
    const resultados = await Promise.allSettled([
      espelharEventoDeAssinatura(evento("PAYMENT_CREATED", "pay_1", "2026-12-10"), AGORA),
      espelharEventoDeAssinatura(evento("PAYMENT_UPDATED", "pay_1", "2026-12-10"), AGORA),
    ]);

    expect(await cobrancas()).toHaveLength(1);
    // O que perde a corrida recebe erro (e o Asaas reentrega); nunca grava duas.
    expect(resultados.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
  });

  it("vencimento remarcado para outro mês atualiza a mesma cobrança", async () => {
    await espelharEventoDeAssinatura(evento("PAYMENT_OVERDUE", "pay_1", "2026-10-10"), AGORA);
    await espelharEventoDeAssinatura(evento("PAYMENT_UPDATED", "pay_1", "2026-12-05"), AGORA);

    const todas = await cobrancas();
    expect(todas).toHaveLength(1);
    expect(todas[0].vencimento.toISOString()).toContain("2026-12-05");
  });

  it("pagamento apagado e recriado no mesmo mês toma o lugar da cobrança cancelada", async () => {
    await espelharEventoDeAssinatura(evento("PAYMENT_CREATED", "pay_velho", "2026-11-10"), AGORA);
    await espelharEventoDeAssinatura(evento("PAYMENT_DELETED", "pay_velho", "2026-11-10"), AGORA);
    await espelharEventoDeAssinatura(evento("PAYMENT_OVERDUE", "pay_novo", "2026-11-10"), AGORA);

    const todas = await cobrancas();
    expect(todas).toHaveLength(1);
    expect(todas[0]).toMatchObject({ asaasPaymentId: `${sub}_pay_novo`, status: "VENCIDA" });
  });

  it("a constraint única do id do pagamento vale de verdade no banco", async () => {
    await espelharEventoDeAssinatura(evento("PAYMENT_CREATED", "pay_unico", "2026-12-10"), AGORA);

    await expect(
      prismaUnscoped.cobranca.create({
        data: { assinaturaId, competencia: "2027-01", valor: 1, vencimento: new Date(), asaasPaymentId: `${sub}_pay_unico` },
      })
    ).rejects.toMatchObject({ code: "P2002" } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
  });

  it("a constraint única de competência por assinatura vale de verdade no banco", async () => {
    await prismaUnscoped.cobranca.create({
      data: { assinaturaId, competencia: "2027-02", valor: 1, vencimento: new Date() },
    });
    await expect(
      prismaUnscoped.cobranca.create({
        data: { assinaturaId, competencia: "2027-02", valor: 1, vencimento: new Date() },
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("cancelamento pelo gateway", () => {
  it("grava o fim do período pago e não marca CANCELADA", async () => {
    await espelharEventoDeAssinatura(evento("PAYMENT_RECEIVED", "pay_1", "2026-11-10"), AGORA);

    await espelharEventoDeAssinatura(
      { event: "SUBSCRIPTION_DELETED", subscription: { id: sub } },
      AGORA
    );

    const a = await prismaUnscoped.assinatura.findUnique({ where: { id: assinaturaId } });
    expect(a?.status).not.toBe("CANCELADA");
    expect(a?.encerraEm?.toISOString()).toContain("2026-12-10");
  });

  it("estorno reabre a cobrança paga", async () => {
    await espelharEventoDeAssinatura(evento("PAYMENT_RECEIVED", "pay_1", "2026-11-10"), AGORA);
    await espelharEventoDeAssinatura(evento("PAYMENT_REFUNDED", "pay_1", "2026-11-10"), AGORA);

    expect((await cobrancas())[0]).toMatchObject({ status: "VENCIDA", pagoEm: null });
  });
});

describe("primeiro pagamento pelo webhook", () => {
  // O estado que a peça "Provisionamento" da tela de saúde conta. Quem pagou e
  // não ganhou o restaurante precisa ficar PAGA no banco: nem apagada pela
  // faxina de inscrição vencida, nem de volta a AGUARDANDO_PAGAMENTO, onde
  // ninguém a enxergaria.
  it("provisionamento que falha deixa a Inscricao PAGA, e o webhook propaga para o Asaas reentregar", async () => {
    const token = "token-do-webhook-de-teste";
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", token);
    const sufixo = crypto.randomBytes(4).toString("hex");
    const sessao = await prismaUnscoped.sessaoFunil.create({ data: { id: crypto.randomUUID() } });
    // Slug com sublinhado: provisionTenant o recusa (SLUG_INVALIDO) antes de
    // criar qualquer coisa, que é o provisionamento falhando de verdade.
    const inscricao = await prismaUnscoped.inscricao.create({
      data: {
        nome: "Pizzaria Sem Sorte",
        slug: `paga_${sufixo}`,
        email: `paga-${sufixo}@exemplo.com`,
        plano: "MEMBRO",
        ciclo: "MENSAL",
        asaasSubscriptionId: `sub_paga_${sufixo}`,
        expiraEm: new Date(Date.now() + 3_600_000),
        sessaoId: sessao.id,
      },
    });

    try {
      const requisicao = new NextRequest("http://localhost/api/assinaturas/webhook/asaas", {
        method: "POST",
        headers: { "content-type": "application/json", "asaas-access-token": token },
        body: JSON.stringify({
          event: "PAYMENT_CONFIRMED",
          payment: {
            id: `pay_paga_${sufixo}`,
            value: 119.99,
            subscription: `sub_paga_${sufixo}`,
            externalReference: inscricao.id,
          },
        }),
      });

      await expect(webhookDoAsaas(requisicao)).rejects.toMatchObject({ code: "SLUG_INVALIDO" });

      const depois = await prismaUnscoped.inscricao.findUnique({ where: { id: inscricao.id } });
      expect(depois?.status).toBe("PAGA");
      expect(
        await prismaUnscoped.eventoFunil.count({ where: { sessaoId: sessao.id, tipo: "PAGOU" } })
      ).toBe(1);
    } finally {
      vi.unstubAllEnvs();
      await prismaUnscoped.eventoFunil.deleteMany({ where: { sessaoId: sessao.id } });
      await prismaUnscoped.inscricao.deleteMany({ where: { id: inscricao.id } });
      await prismaUnscoped.sessaoFunil.delete({ where: { id: sessao.id } });
    }
  });
});
