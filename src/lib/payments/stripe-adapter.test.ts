import { describe, expect, it, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import { StripeAdapter } from "@/lib/payments/stripe-adapter";
import { encryptCredentials } from "@/lib/payments/credentials";
import { InvalidWebhookSignatureError } from "@/lib/payments/types";
import type { PaymentConnection } from "@prisma/client";

const WHSEC = "whsec_do_lojista";

function connectionWith(creds: Record<string, string>): PaymentConnection {
  return {
    id: "conn-1",
    tenantId: "tenant-1",
    provider: "stripe",
    credentials: encryptCredentials(creds),
    externalAccountId: null,
    status: "active",
    lastCheckedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const fullCreds = { secretKey: "sk_test_123", webhookSecret: WHSEC };

const body = JSON.stringify({
  type: "checkout.session.completed",
  data: { object: { id: "cs_1", client_reference_id: "order-1" } },
});

function signedHeaders(secret: string, rawBody: string, ts = "1700000000"): Headers {
  const v1 = crypto.createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  return new Headers({ "stripe-signature": `t=${ts},v1=${v1}` });
}

const adapter = new StripeAdapter();

beforeEach(() => vi.restoreAllMocks());

describe("handleWebhook — assinatura", () => {
  it("RECUSA quando o lojista não configurou a chave de assinatura", async () => {
    await expect(
      adapter.handleWebhook(body, signedHeaders(WHSEC, body), connectionWith({ secretKey: "sk" }))
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa assinatura de outro segredo", async () => {
    await expect(
      adapter.handleWebhook(body, signedHeaders("whsec_errado", body), connectionWith(fullCreds))
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa header ausente", async () => {
    await expect(
      adapter.handleWebhook(body, new Headers(), connectionWith(fullCreds))
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa corpo adulterado depois de assinado", async () => {
    const headers = signedHeaders(WHSEC, body);
    const adulterado = JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", client_reference_id: "order-DO-ATACANTE" } },
    });

    await expect(
      adapter.handleWebhook(adulterado, headers, connectionWith(fullCreds))
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa v1 de tamanho diferente sem estourar RangeError", async () => {
    const headers = new Headers({ "stripe-signature": "t=1,v1=abc" });

    await expect(
      adapter.handleWebhook(body, headers, connectionWith(fullCreds))
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });
});

describe("handleWebhook — caminho feliz", () => {
  it("com assinatura válida, devolve o pedido e o pagamento", async () => {
    const result = await adapter.handleWebhook(
      body,
      signedHeaders(WHSEC, body),
      connectionWith(fullCreds)
    );

    expect(result).toEqual({
      orderId: "order-1",
      providerPaymentId: "cs_1",
      status: "approved",
    });
  });

  it("ignora evento que não interessa", async () => {
    const outro = JSON.stringify({
      type: "customer.created",
      data: { object: { id: "cus_1", client_reference_id: "order-1" } },
    });

    const result = await adapter.handleWebhook(
      outro,
      signedHeaders(WHSEC, outro),
      connectionWith(fullCreds)
    );

    expect(result).toBeNull();
  });
});

describe("createCharge", () => {
  const order = {
    id: "order-1",
    total: 40.5,
    customerName: "Maria",
    paymentMethod: "CREDIT_CARD" as const,
    items: [{ menuItemId: "m1", name: "X-Bacon", quantity: 1, unitPrice: 40.5 }],
  };

  it("manda o valor em centavos, sem erro de arredondamento", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ id: "cs_1", url: "https://checkout.stripe/cs_1" }));

    await adapter.createCharge(order, connectionWith(fullCreds));

    const sent = String(fetchMock.mock.calls[0][1]?.body);
    expect(sent).toContain("unit_amount%5D=4050");
  });

  it("liga o pedido pela client_reference_id", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ id: "cs_1", url: "https://checkout.stripe/cs_1" }));

    await adapter.createCharge(order, connectionWith(fullCreds));

    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("client_reference_id=order-1");
  });

  it("devolve a URL de checkout", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ id: "cs_1", url: "https://checkout.stripe/cs_1" })
    );

    const charge = await adapter.createCharge(order, connectionWith(fullCreds));

    expect(charge).toMatchObject({
      provider: "stripe",
      status: "pending",
      checkoutUrl: "https://checkout.stripe/cs_1",
    });
  });

  it("propaga a mensagem de erro da Stripe", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Invalid API Key provided" } }), {
        status: 401,
      })
    );

    await expect(adapter.createCharge(order, connectionWith(fullCreds))).rejects.toThrow(
      /Invalid API Key/
    );
  });
});
