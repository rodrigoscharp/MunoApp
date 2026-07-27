import { describe, expect, it, vi, beforeEach } from "vitest";
import { AsaasAdapter } from "@/lib/payments/asaas-adapter";
import { encryptCredentials } from "@/lib/payments/credentials";
import { InvalidWebhookSignatureError } from "@/lib/payments/types";
import type { PaymentConnection } from "@prisma/client";

const WEBHOOK_TOKEN = "token-do-lojista";

function connectionWith(creds: Record<string, string>): PaymentConnection {
  return {
    id: "conn-1",
    tenantId: "tenant-1",
    provider: "asaas",
    credentials: encryptCredentials(creds),
    externalAccountId: null,
    status: "active",
    lastCheckedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const fullCreds = {
  apiKey: "chave-do-lojista",
  environment: "sandbox",
  webhookSecret: WEBHOOK_TOKEN,
};

const paymentEventObj = {
  event: "PAYMENT_RECEIVED",
  payment: { id: "pay_123", status: "RECEIVED", externalReference: "order-1" },
};
const paymentEvent = JSON.stringify(paymentEventObj);

const adapter = new AsaasAdapter();

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("handleWebhook — autenticação", () => {
  it("RECUSA quando o lojista não configurou o token do webhook", async () => {
    const connection = connectionWith({ apiKey: "k", environment: "sandbox" });
    const headers = new Headers({ "asaas-access-token": WEBHOOK_TOKEN });

    await expect(adapter.handleWebhook(paymentEvent, headers, connection)).rejects.toThrow(
      InvalidWebhookSignatureError
    );
  });

  it("recusa token errado", async () => {
    const headers = new Headers({ "asaas-access-token": "token-errado" });

    await expect(
      adapter.handleWebhook(paymentEvent, headers, connectionWith(fullCreds))
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa header ausente", async () => {
    await expect(
      adapter.handleWebhook(paymentEvent, new Headers(), connectionWith(fullCreds))
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa token de tamanho diferente sem estourar RangeError", async () => {
    const headers = new Headers({ "asaas-access-token": "x" });

    await expect(
      adapter.handleWebhook(paymentEvent, headers, connectionWith(fullCreds))
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("ignora evento que não é de pagamento", async () => {
    const headers = new Headers({ "asaas-access-token": WEBHOOK_TOKEN });

    const result = await adapter.handleWebhook(
      JSON.stringify({ event: "SUBSCRIPTION_CREATED", subscription: { id: "s1" } }),
      headers,
      connectionWith(fullCreds)
    );

    expect(result).toBeNull();
  });
});

describe("handleWebhook — caminho feliz", () => {
  it("com token certo, mapeia PAYMENT_RECEIVED para approved", async () => {
    const headers = new Headers({ "asaas-access-token": WEBHOOK_TOKEN });

    const result = await adapter.handleWebhook(paymentEvent, headers, connectionWith(fullCreds));

    expect(result).toEqual({
      orderId: "order-1",
      providerPaymentId: "pay_123",
      status: "approved",
    });
  });

  it("PAYMENT_CONFIRMED também conta como pago", async () => {
    const headers = new Headers({ "asaas-access-token": WEBHOOK_TOKEN });

    const result = await adapter.handleWebhook(
      JSON.stringify({ event: "PAYMENT_CONFIRMED", payment: { id: "p2", externalReference: "order-2" } }),
      headers,
      connectionWith(fullCreds)
    );

    expect(result?.status).toBe("approved");
  });

  it("estorno vira refunded", async () => {
    const headers = new Headers({ "asaas-access-token": WEBHOOK_TOKEN });

    const result = await adapter.handleWebhook(
      JSON.stringify({ event: "PAYMENT_REFUNDED", payment: { id: "p3", externalReference: "order-3" } }),
      headers,
      connectionWith(fullCreds)
    );

    expect(result?.status).toBe("refunded");
  });

  it("evento sem externalReference é ignorado — não dá pra saber o pedido", async () => {
    const headers = new Headers({ "asaas-access-token": WEBHOOK_TOKEN });

    const result = await adapter.handleWebhook(
      JSON.stringify({ event: "PAYMENT_RECEIVED", payment: { id: "p4" } }),
      headers,
      connectionWith(fullCreds)
    );

    expect(result).toBeNull();
  });
});

describe("createCharge", () => {
  const order = {
    id: "order-1",
    total: 40,
    customerName: "Maria Silva",
    payerDocument: "52998224725",
    paymentMethod: "PIX" as const,
    items: [{ menuItemId: "m1", name: "X-Bacon", quantity: 1, unitPrice: 40 }],
  };

  it("exige o CPF do pagador — o Asaas não cria cobrança sem cliente identificado", async () => {
    await expect(
      adapter.createCharge({ ...order, payerDocument: undefined }, connectionWith(fullCreds))
    ).rejects.toThrow(/CPF/i);
  });

  it("usa o ambiente sandbox quando configurado", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes("/customers")) return Response.json({ id: "cus_1" });
      if (href.includes("/pixQrCode")) return Response.json({ encodedImage: "img", payload: "copia-e-cola" });
      return Response.json({ id: "pay_1", invoiceUrl: "https://asaas/i/1" });
    });

    await adapter.createCharge(order, connectionWith(fullCreds));

    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain("api-sandbox.asaas.com");
    }
  });

  it("manda a chave do lojista no header access_token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes("/customers")) return Response.json({ id: "cus_1" });
      if (href.includes("/pixQrCode")) return Response.json({ encodedImage: "img", payload: "copia-e-cola" });
      return Response.json({ id: "pay_1" });
    });

    await adapter.createCharge(order, connectionWith(fullCreds));

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.access_token).toBe("chave-do-lojista");
  });

  it("devolve o QR code do PIX", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes("/customers")) return Response.json({ id: "cus_1" });
      if (href.includes("/pixQrCode")) {
        return Response.json({ encodedImage: "base64img", payload: "copia-e-cola" });
      }
      return Response.json({ id: "pay_1" });
    });

    const charge = await adapter.createCharge(order, connectionWith(fullCreds));

    expect(charge).toMatchObject({
      provider: "asaas",
      status: "pending",
      paymentId: "pay_1",
      pixQrCode: "base64img",
      pixCopyPaste: "copia-e-cola",
    });
  });

  it("no cartão devolve a invoiceUrl como checkout", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/customers")) return Response.json({ id: "cus_1" });
      return Response.json({ id: "pay_2", invoiceUrl: "https://asaas/i/2" });
    });

    const charge = await adapter.createCharge(
      { ...order, paymentMethod: "CREDIT_CARD" },
      connectionWith(fullCreds)
    );

    expect(charge.checkoutUrl).toBe("https://asaas/i/2");
  });

  it("propaga erro do gateway em vez de fingir que cobrou", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ description: "Chave inválida" }] }), { status: 401 })
    );

    await expect(adapter.createCharge(order, connectionWith(fullCreds))).rejects.toThrow(
      /Chave inválida/
    );
  });
});
