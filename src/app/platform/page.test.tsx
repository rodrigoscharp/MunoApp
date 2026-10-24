import { afterEach, describe, expect, it, vi } from "vitest";

// A visão geral lia toda cobrança em aberto para mostrar cinco e somar o
// resto no JavaScript. O que este teste trava: a lista vem limitada, e o total
// e as vencidas saem de agregados no banco com o mesmo predicado.

vi.mock("@/lib/auth-platform", () => ({
  authPlatform: vi.fn().mockResolvedValue({ user: { id: "p1" } }),
}));

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn().mockResolvedValue([]),
  lead: { findMany: vi.fn().mockResolvedValue([]) },
  tenant: { findMany: vi.fn().mockResolvedValue([{ id: "t1", nome: "Pizzaria", status: "active", createdAt: new Date() }]) },
  assinatura: { findMany: vi.fn().mockResolvedValue([]) },
  cobranca: {
    findMany: vi.fn().mockResolvedValue([]),
    aggregate: vi.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { valor: null } }),
    count: vi.fn().mockResolvedValue(0),
  },
  order: {
    groupBy: vi
      .fn()
      .mockResolvedValue([{ tenantId: "t1", _count: { _all: 3 }, _sum: { total: { toString: () => "42.5" } } }]),
  },
}));
vi.mock("@/lib/prisma", () => ({ prismaUnscoped: prismaMock }));

import VisaoGeralPage from "./page";

afterEach(() => vi.clearAllMocks());

describe("VisaoGeralPage", () => {
  it("lista só as cobranças que mostra e soma as demais no banco", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-24T13:30:00Z"), toFake: ["Date"] });
    try {
      expect(await VisaoGeralPage()).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }

    const emAberto = { status: { in: ["PENDENTE", "VENCIDA"] } };
    expect(prismaMock.cobranca.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: emAberto, take: 5 })
    );
    expect(prismaMock.cobranca.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: emAberto })
    );
    expect(prismaMock.cobranca.count).toHaveBeenCalledWith({
      where: { ...emAberto, vencimento: { lt: new Date("2026-10-24T00:00:00.000Z") } },
    });
  });
});
