import { describe, expect, it, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: { paymentConnection: { findFirst } },
}));

const { getEnabledPaymentMethods, getActiveConnection, listPaymentProviders, getPaymentProvider } =
  await import("@/lib/payments/factory");

beforeEach(() => findFirst.mockReset());

describe("getEnabledPaymentMethods", () => {
  it("sem conexão ativa, só dinheiro", async () => {
    findFirst.mockResolvedValue(null);

    expect(await getEnabledPaymentMethods("tenant-1")).toEqual(["CASH"]);
  });

  it("conexão pending_webhook não habilita pagamento online", async () => {
    // getActiveConnection filtra por status 'active', então o findFirst
    // não devolve nada mesmo existindo linha em pending_webhook.
    findFirst.mockResolvedValue(null);

    expect(await getEnabledPaymentMethods("tenant-1")).toEqual(["CASH"]);
  });

  it("conexão ativa habilita os métodos do gateway mais dinheiro", async () => {
    findFirst.mockResolvedValue({ provider: "mercado_pago", status: "active" });

    const methods = await getEnabledPaymentMethods("tenant-1");

    expect(methods).toContain("PIX");
    expect(methods).toContain("CREDIT_CARD");
    expect(methods).toContain("CASH");
  });
});

describe("getActiveConnection", () => {
  it("consulta apenas conexões com status active", async () => {
    findFirst.mockResolvedValue(null);
    await getActiveConnection("tenant-1");

    expect(findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", status: "active" },
    });
  });
});

describe("registry", () => {
  it("lista os gateways disponíveis", () => {
    const ids = listPaymentProviders().map((p) => p.meta.id);

    expect(ids).toContain("mercado_pago");
    // Registrar o adapter é tudo que um gateway novo precisa pra aparecer
    // no painel: a tela se monta a partir do meta.
    expect(ids).toContain("asaas");
  });

  it("todo gateway declara se exige documento do pagador", () => {
    for (const provider of listPaymentProviders()) {
      expect(typeof provider.meta.requiresPayerDocument).toBe("boolean");
    }
  });

  it("explode em gateway desconhecido", () => {
    expect(() => getPaymentProvider("nubank")).toThrow();
  });
});
