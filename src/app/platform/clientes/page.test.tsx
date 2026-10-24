import { afterEach, describe, expect, it, vi } from "vitest";

// A lista de clientes contava os pedidos de cada restaurante dentro do
// findMany, sobre a tabela inteira de pedidos, a cada abertura. O que este
// teste trava: a contagem sai de um groupBy à parte (o que fica em cache), e
// a consulta da lista, que é ao vivo, não volta a pedir `_count`.

vi.mock("@/lib/auth-platform", () => ({
  authPlatform: vi.fn().mockResolvedValue({ user: { id: "p1" } }),
}));

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/lib/tenant-provisioning", () => ({
  buildTenantBaseUrl: (slug: string) => `https://${slug}.munoapp.com.br`,
}));

const prismaMock = vi.hoisted(() => ({
  tenant: { findMany: vi.fn() },
  order: { groupBy: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prismaUnscoped: prismaMock }));

import ClientesPage from "./page";

afterEach(() => vi.clearAllMocks());

const tenant = (id: string) => ({
  id,
  nome: id,
  slug: id,
  status: "active",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  assinatura: null,
});

describe("ClientesPage", () => {
  it("conta pedidos por restaurante fora da consulta da lista", async () => {
    prismaMock.tenant.findMany.mockResolvedValue([tenant("a"), tenant("b")]);
    prismaMock.order.groupBy.mockResolvedValue([{ tenantId: "a", _count: { _all: 7 } }]);

    const tela = await ClientesPage();

    expect(prismaMock.order.groupBy).toHaveBeenCalledWith({ by: ["tenantId"], _count: { _all: true } });
    const consulta = prismaMock.tenant.findMany.mock.calls[0][0];
    expect(consulta.include).not.toHaveProperty("_count");
    // "a" mostra os 7 do groupBy; "b", sem linha nele, mostra zero.
    const texto = JSON.stringify(tela);
    expect(texto).toContain('[7," ","pedidos"');
    expect(texto).toContain('[0," ","pedidos"');
  });
});
