import { describe, expect, it, vi, beforeEach } from "vitest";

const orderUpdateMany = vi.fn();
const itemUpdateMany = vi.fn();
const chatDeleteMany = vi.fn();
const trackingDeleteMany = vi.fn();
const tokenDeleteMany = vi.fn();

const tx = {
  order: { updateMany: (...a: unknown[]) => orderUpdateMany(...a) },
  orderItem: { updateMany: (...a: unknown[]) => itemUpdateMany(...a) },
  chatMessage: { deleteMany: (...a: unknown[]) => chatDeleteMany(...a) },
  deliveryTracking: { deleteMany: (...a: unknown[]) => trackingDeleteMany(...a) },
};

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    passwordResetToken: { deleteMany: (...a: unknown[]) => tokenDeleteMany(...a) },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

import { aplicarRetencao, limparTokensExpirados, mesesDeRetencao } from "./retencao";

const AGORA = new Date("2026-10-02T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  orderUpdateMany.mockResolvedValue({ count: 3 });
  itemUpdateMany.mockResolvedValue({ count: 5 });
  chatDeleteMany.mockResolvedValue({ count: 2 });
  trackingDeleteMany.mockResolvedValue({ count: 1 });
  tokenDeleteMany.mockResolvedValue({ count: 4 });
});

describe("mesesDeRetencao", () => {
  it("sem a variável, a retenção está desligada: a decisão de prazo é do negócio", () => {
    expect(mesesDeRetencao({})).toBeNull();
  });
  it.each(["", "abc", "0", "-3"])("valor inválido (%j) desliga", (v) => {
    expect(mesesDeRetencao({ RETENCAO_PEDIDOS_MESES: v })).toBeNull();
  });
  it("aceita um número positivo de meses", () => {
    expect(mesesDeRetencao({ RETENCAO_PEDIDOS_MESES: "24" })).toBe(24);
  });
});

describe("aplicarRetencao", () => {
  it("anonimiza dado pessoal de pedido mais antigo que o prazo, mantendo o pedido", async () => {
    await aplicarRetencao(AGORA, 24);

    const corte = new Date("2024-10-02T12:00:00Z");
    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: corte },
        OR: [
          { customerName: { not: null } },
          { customerPhone: { not: null } },
          { deliveryAddress: { not: null } },
          { notes: { not: null } },
        ],
      },
      data: { customerName: null, customerPhone: null, deliveryAddress: null, notes: null },
    });
  });

  it("apaga conversa e localização dos pedidos antigos e limpa a observação dos itens", async () => {
    await aplicarRetencao(AGORA, 24);
    const corte = new Date("2024-10-02T12:00:00Z");

    expect(chatDeleteMany).toHaveBeenCalledWith({ where: { order: { createdAt: { lt: corte } } } });
    expect(trackingDeleteMany).toHaveBeenCalledWith({ where: { order: { createdAt: { lt: corte } } } });
    expect(itemUpdateMany).toHaveBeenCalledWith({
      where: { notes: { not: null }, order: { createdAt: { lt: corte } } },
      data: { notes: null },
    });
  });

  it("devolve as contagens", async () => {
    expect(await aplicarRetencao(AGORA, 24)).toEqual({
      pedidos: 3, itens: 5, mensagensDeChat: 2, rastreamentos: 1,
    });
  });

  it("rodar de novo não acha nada (idempotente): o filtro exige dado ainda presente", async () => {
    orderUpdateMany.mockResolvedValue({ count: 0 });
    expect((await aplicarRetencao(AGORA, 24)).pedidos).toBe(0);
  });
});

describe("limparTokensExpirados", () => {
  it("apaga só o que já venceu", async () => {
    expect(await limparTokensExpirados(AGORA)).toBe(4);
    expect(tokenDeleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: AGORA } } });
  });
});
