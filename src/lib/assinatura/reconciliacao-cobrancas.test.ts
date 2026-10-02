/**
 * Rede de segurança do espelho: se o webhook do Asaas para uma renovação se
 * perde, a Cobranca daquele mês nunca existe, a régua não tem o que medir e
 * quem parou de pagar segue com acesso. O cron pergunta ao Asaas e alimenta o
 * mesmo espelho do webhook.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const assinaturaFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: { assinatura: { findMany: (...a: unknown[]) => assinaturaFindMany(...a) } },
}));

const listarPagamentos = vi.fn();
vi.mock("@/lib/assinatura/asaas", () => ({
  listarPagamentosDaAssinatura: (...a: unknown[]) => listarPagamentos(...a),
}));

const espelhar = vi.fn();
vi.mock("@/lib/assinatura/espelho", () => ({
  espelharEventoDeAssinatura: (...a: unknown[]) => espelhar(...a),
}));

vi.mock("@/lib/observabilidade", () => ({ reportarErro: vi.fn() }));

import { reconciliarCobrancasDoAsaas } from "./reconciliacao-cobrancas";

const AGORA = new Date("2026-11-20T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  assinaturaFindMany.mockResolvedValue([{ id: "a1", asaasSubscriptionId: "sub_1" }]);
  listarPagamentos.mockResolvedValue([]);
  espelhar.mockResolvedValue(true);
});

describe("reconciliarCobrancasDoAsaas", () => {
  it("só olha assinatura do gateway que não foi cancelada", async () => {
    await reconciliarCobrancasDoAsaas(AGORA);

    expect(assinaturaFindMany.mock.calls[0][0].where).toEqual({
      asaasSubscriptionId: { not: null },
      status: { not: "CANCELADA" },
    });
  });

  it.each([
    ["PENDING", "PAYMENT_CREATED"],
    ["OVERDUE", "PAYMENT_OVERDUE"],
    ["RECEIVED", "PAYMENT_RECEIVED"],
    ["CONFIRMED", "PAYMENT_RECEIVED"],
    ["RECEIVED_IN_CASH", "PAYMENT_RECEIVED"],
  ])("pagamento %s vira o evento %s do espelho", async (status, evento) => {
    listarPagamentos.mockResolvedValue([
      { id: "pay_9", status, value: 119.99, dueDate: "2026-11-10" },
    ]);

    await reconciliarCobrancasDoAsaas(AGORA);

    expect(espelhar).toHaveBeenCalledWith(
      {
        event: evento,
        payment: { id: "pay_9", value: 119.99, subscription: "sub_1", dueDate: "2026-11-10" },
      },
      AGORA
    );
  });

  it("ignora status que o espelho não representa (estornado, em análise)", async () => {
    listarPagamentos.mockResolvedValue([
      { id: "p1", status: "REFUNDED", value: 1, dueDate: "2026-11-10" },
      { id: "p2", status: "AWAITING_RISK_ANALYSIS", value: 1, dueDate: "2026-11-10" },
    ]);

    await reconciliarCobrancasDoAsaas(AGORA);

    expect(espelhar).not.toHaveBeenCalled();
  });

  it("uma assinatura que falha não impede as outras, e é contada", async () => {
    assinaturaFindMany.mockResolvedValue([
      { id: "a1", asaasSubscriptionId: "sub_1" },
      { id: "a2", asaasSubscriptionId: "sub_2" },
    ]);
    listarPagamentos
      .mockRejectedValueOnce(new Error("Asaas fora do ar"))
      .mockResolvedValueOnce([{ id: "p", status: "OVERDUE", value: 1, dueDate: "2026-11-10" }]);

    const resultado = await reconciliarCobrancasDoAsaas(AGORA);

    expect(resultado).toEqual({ assinaturas: 2, cobrancas: 1, falhas: 1 });
    expect(espelhar).toHaveBeenCalledTimes(1);
  });

  it("consulta o Asaas em lotes, e não uma assinatura de cada vez nem todas ao mesmo tempo", async () => {
    assinaturaFindMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, asaasSubscriptionId: `sub_${i}` }))
    );
    let simultaneas = 0;
    let pico = 0;
    listarPagamentos.mockImplementation(async () => {
      simultaneas++;
      pico = Math.max(pico, simultaneas);
      await new Promise((r) => setTimeout(r, 5));
      simultaneas--;
      return [];
    });

    await reconciliarCobrancasDoAsaas(AGORA);

    expect(pico).toBeGreaterThan(1);
    expect(pico).toBeLessThanOrEqual(5);
  });
});
