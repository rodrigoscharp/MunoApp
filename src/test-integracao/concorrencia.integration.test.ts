/**
 * Corridas que os testes de unidade só conseguem descrever em comentário: aqui
 * duas requisições disputam o mesmo banco de verdade, e quem decide é a
 * constraint única.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma, prismaUnscoped } from "@/lib/prisma";

vi.mock("@/lib/assinatura/email-boas-vindas", () => ({
  enviarBoasVindas: vi.fn().mockResolvedValue(undefined),
}));

import { provisionarInscricao } from "@/lib/assinatura/provisionamento";
import { comTenant, criarTenant, limparTenants, pedidoMinimo, registrarParaLimpeza } from "./apoio";
import crypto from "node:crypto";

afterAll(limparTenants);

describe("pedido: a chave de idempotência", () => {
  it("duas criações simultâneas com a mesma chave viram um pedido só", async () => {
    const t = await criarTenant("idem");
    const chave = crypto.randomUUID();

    const resultados = await Promise.allSettled([
      comTenant(t.id, () => prisma.order.create({ data: pedidoMinimo(t.id, { idempotencyKey: chave }) })),
      comTenant(t.id, () => prisma.order.create({ data: pedidoMinimo(t.id, { idempotencyKey: chave }) })),
    ]);

    expect(await prismaUnscoped.order.count({ where: { tenantId: t.id, idempotencyKey: chave } })).toBe(1);
    const perdedor = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(perdedor.reason).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(perdedor.reason.code).toBe("P2002");
  });

  it("a mesma chave em outro restaurante é outro pedido (o unique é por restaurante)", async () => {
    const a = await criarTenant("idem-a");
    const b = await criarTenant("idem-b");
    const chave = crypto.randomUUID();

    await comTenant(a.id, () => prisma.order.create({ data: pedidoMinimo(a.id, { idempotencyKey: chave }) }));
    await comTenant(b.id, () => prisma.order.create({ data: pedidoMinimo(b.id, { idempotencyKey: chave }) }));

    expect(await prismaUnscoped.order.count({ where: { idempotencyKey: chave } })).toBe(2);
  });

  it("pedidos sem chave não colidem entre si (nulos não contam no unique)", async () => {
    const t = await criarTenant("idem-nulo");
    for (let i = 0; i < 3; i++) {
      await comTenant(t.id, () => prisma.order.create({ data: pedidoMinimo(t.id) }));
    }
    expect(await prismaUnscoped.order.count({ where: { tenantId: t.id } })).toBe(3);
  });
});

describe("provisionamento concorrente", () => {
  it("webhook e reconciliação chegando juntos criam um restaurante só", async () => {
    const slug = `prov-${crypto.randomBytes(4).toString("hex")}`;
    registrarParaLimpeza(slug);
    const inscricao = await prismaUnscoped.inscricao.create({
      data: {
        nome: "Pizzaria Concorrente",
        slug,
        email: `${slug}@exemplo.com`,
        plano: "MEMBRO",
        ciclo: "MENSAL",
        asaasSubscriptionId: `sub_${slug}`,
        expiraEm: new Date(Date.now() + 3_600_000),
      },
    });

    const resultados = await Promise.allSettled([
      provisionarInscricao(inscricao, { origem: "teste/webhook", pagamentoId: `pay_${slug}` }),
      provisionarInscricao(inscricao, { origem: "teste/reconciliacao", pagamentoId: `pay_${slug}` }),
    ]);

    // Pelo menos um terminou o trabalho; o outro pode ter perdido a corrida
    // (e o Asaas reentrega), mas nunca sobra restaurante ou cobrança em dobro.
    expect(resultados.some((r) => r.status === "fulfilled")).toBe(true);

    expect(await prismaUnscoped.tenant.count({ where: { slug } })).toBe(1);
    const tenant = await prismaUnscoped.tenant.findUniqueOrThrow({ where: { slug } });
    expect(await prismaUnscoped.assinatura.count({ where: { tenantId: tenant.id } })).toBe(1);
    const assinatura = await prismaUnscoped.assinatura.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    expect(await prismaUnscoped.cobranca.count({ where: { assinaturaId: assinatura.id } })).toBe(1);
    expect(await prismaUnscoped.user.count({ where: { tenantId: tenant.id, role: "ADMIN" } })).toBe(1);

    const depois = await prismaUnscoped.inscricao.findUniqueOrThrow({ where: { id: inscricao.id } });
    expect(depois.status).toBe("PROVISIONADA");
    expect(assinatura.asaasSubscriptionId).toBe(`sub_${slug}`);
  });

  it("uma segunda entrega depois de terminada é no-op: nada é criado de novo", async () => {
    const slug = `prov2-${crypto.randomBytes(4).toString("hex")}`;
    registrarParaLimpeza(slug);
    const inscricao = await prismaUnscoped.inscricao.create({
      data: {
        nome: "Pizzaria Repetida",
        slug,
        email: `${slug}@exemplo.com`,
        plano: "MEMBRO",
        ciclo: "MENSAL",
        asaasSubscriptionId: `sub_${slug}`,
        expiraEm: new Date(Date.now() + 3_600_000),
      },
    });

    await provisionarInscricao(inscricao, { origem: "teste/1" });
    const fresca = await prismaUnscoped.inscricao.findUniqueOrThrow({ where: { id: inscricao.id } });
    await provisionarInscricao(fresca, { origem: "teste/2" }).catch(() => {});

    const tenant = await prismaUnscoped.tenant.findUniqueOrThrow({ where: { slug } });
    expect(await prismaUnscoped.assinatura.count({ where: { tenantId: tenant.id } })).toBe(1);
  });
});
