import { describe, expect, it, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import { encryptCredentials } from "@/lib/payments/credentials";
import { InvalidWebhookSignatureError } from "@/lib/payments/types";
import type { PaymentConnection } from "@prisma/client";

// Mock do SDK do Mercado Pago: sem isso, o teste de caminho feliz bateria
// na API de verdade. Os spies servem pra provar duas coisas que o mutation
// testing do review mostrou que os testes de rejeição sozinhos não provam:
// (1) que uma notificação válida é processada de fato (não só "não lança"),
// e (2) que a consulta usa o access token do LOJISTA, nunca um token de
// plataforma — a exigência central desta task.
const { mockConfigCtor, mockPaymentCtor, mockPaymentGet } = vi.hoisted(() => ({
  mockConfigCtor: vi.fn(),
  mockPaymentCtor: vi.fn(),
  mockPaymentGet: vi.fn(),
}));

vi.mock("mercadopago", () => {
  class MockMercadoPagoConfig {
    constructor(options: { accessToken: string }) {
      mockConfigCtor(options);
    }
  }
  class MockPayment {
    constructor(config: unknown) {
      mockPaymentCtor(config);
    }
    get(args: { id: string }) {
      return mockPaymentGet(args);
    }
  }
  class MockPreference {}
  return {
    MercadoPagoConfig: MockMercadoPagoConfig,
    Payment: MockPayment,
    Preference: MockPreference,
  };
});

const { MercadoPagoAdapter } = await import("@/lib/payments/mercadopago-adapter");

const WEBHOOK_SECRET = "segredo-do-lojista";
const DATA_ID = "123456";

function connectionWith(creds: Record<string, string>): PaymentConnection {
  return {
    id: "conn-1",
    tenantId: "tenant-1",
    provider: "mercado_pago",
    credentials: encryptCredentials(creds),
    externalAccountId: null,
    status: "active",
    lastCheckedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function signedHeaders(secret: string, requestId = "req-1", ts = "1700000000"): Headers {
  const manifest = `id:${DATA_ID};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return new Headers({ "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId });
}

const payload = { type: "payment", data: { id: DATA_ID } };
const adapter = new MercadoPagoAdapter();

describe("handleWebhook — assinatura", () => {
  it("RECUSA quando o lojista não configurou webhook secret", async () => {
    const connection = connectionWith({ accessToken: "APP_USR-1" });

    await expect(
      adapter.handleWebhook(payload, signedHeaders(WEBHOOK_SECRET), connection)
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa assinatura forjada", async () => {
    const connection = connectionWith({ accessToken: "APP_USR-1", webhookSecret: WEBHOOK_SECRET });

    await expect(
      adapter.handleWebhook(payload, signedHeaders("secret-errado"), connection)
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa header x-signature ausente", async () => {
    const connection = connectionWith({ accessToken: "APP_USR-1", webhookSecret: WEBHOOK_SECRET });

    await expect(
      adapter.handleWebhook(payload, new Headers(), connection)
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa v1 de tamanho diferente sem estourar RangeError", async () => {
    const connection = connectionWith({ accessToken: "APP_USR-1", webhookSecret: WEBHOOK_SECRET });
    const headers = new Headers({ "x-signature": "ts=1,v1=abc", "x-request-id": "req-1" });

    await expect(adapter.handleWebhook(payload, headers, connection)).rejects.toThrow(
      InvalidWebhookSignatureError
    );
  });

  it("ignora payload que não é notificação de pagamento", async () => {
    const connection = connectionWith({ accessToken: "APP_USR-1", webhookSecret: WEBHOOK_SECRET });

    const result = await adapter.handleWebhook(
      { type: "plan", data: { id: "1" } },
      signedHeaders(WEBHOOK_SECRET),
      connection
    );

    expect(result).toBeNull();
  });
});

describe("handleWebhook — caminho feliz", () => {
  beforeEach(() => {
    mockConfigCtor.mockClear();
    mockPaymentCtor.mockClear();
    mockPaymentGet.mockReset();
  });

  it("com secret certo e assinatura válida, resolve com os dados do pagamento", async () => {
    const connection = connectionWith({ accessToken: "APP_USR-do-tenant", webhookSecret: WEBHOOK_SECRET });
    mockPaymentGet.mockResolvedValue({
      id: 999,
      status: "approved",
      external_reference: "order-abc",
    });

    const result = await adapter.handleWebhook(payload, signedHeaders(WEBHOOK_SECRET), connection);

    expect(result).toEqual({
      orderId: "order-abc",
      providerPaymentId: "999",
      status: "approved",
    });
  });

  it("consulta o pagamento com o access token do LOJISTA, não um token de plataforma", async () => {
    const connection = connectionWith({ accessToken: "APP_USR-do-tenant", webhookSecret: WEBHOOK_SECRET });
    mockPaymentGet.mockResolvedValue({
      id: 1,
      status: "approved",
      external_reference: "order-1",
    });

    await adapter.handleWebhook(payload, signedHeaders(WEBHOOK_SECRET), connection);

    expect(mockConfigCtor).toHaveBeenCalledWith({ accessToken: "APP_USR-do-tenant" });
    expect(mockPaymentGet).toHaveBeenCalledWith({ id: DATA_ID });
  });
});
