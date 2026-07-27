import { describe, expect, it, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import { AbacatePayAdapter } from "@/lib/payments/abacatepay-adapter";
import { encryptCredentials } from "@/lib/payments/credentials";
import { InvalidWebhookSignatureError } from "@/lib/payments/types";
import type { PaymentConnection } from "@prisma/client";

const SECRET = "segredo-do-lojista";

function connectionWith(creds: Record<string, string>): PaymentConnection {
  return {
    id: "conn-1",
    tenantId: "tenant-1",
    provider: "abacate_pay",
    credentials: encryptCredentials(creds),
    externalAccountId: null,
    status: "active",
    lastCheckedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const fullCreds = { apiKey: "abc_123", webhookSecret: SECRET };

const body = JSON.stringify({
  event: "transparent.completed",
  data: { id: "pix_1", externalId: "order-1", status: "PAID" },
});

function urlWith(secret: string | null): URL {
  const base = "https://loja.muno.app/api/payments/webhook/abacate_pay/tenant-1";
  return new URL(secret === null ? base : `${base}?webhookSecret=${secret}`);
}

function signedHeaders(secret: string, rawBody: string): Headers {
  return new Headers({
    "x-webhook-signature": crypto.createHmac("sha256", secret).update(rawBody).digest("hex"),
  });
}

const adapter = new AbacatePayAdapter();

beforeEach(() => vi.restoreAllMocks());

describe("handleWebhook — autenticação", () => {
  it("RECUSA quando o lojista não configurou o segredo", async () => {
    await expect(
      adapter.handleWebhook(body, new Headers(), connectionWith({ apiKey: "k" }), urlWith(SECRET))
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa quando a query não traz o segredo", async () => {
    await expect(
      adapter.handleWebhook(body, signedHeaders(SECRET, body), connectionWith(fullCreds), urlWith(null))
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa segredo errado na query", async () => {
    await expect(
      adapter.handleWebhook(
        body,
        signedHeaders(SECRET, body),
        connectionWith(fullCreds),
        urlWith("errado")
      )
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa corpo adulterado quando vem assinatura", async () => {
    const headers = signedHeaders(SECRET, body);
    const adulterado = JSON.stringify({
      event: "transparent.completed",
      data: { id: "pix_1", externalId: "order-DO-ATACANTE" },
    });

    await expect(
      adapter.handleWebhook(adulterado, headers, connectionWith(fullCreds), urlWith(SECRET))
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });
});

describe("handleWebhook — caminho feliz", () => {
  it("com segredo e assinatura certos, devolve o pedido", async () => {
    const result = await adapter.handleWebhook(
      body,
      signedHeaders(SECRET, body),
      connectionWith(fullCreds),
      urlWith(SECRET)
    );

    expect(result).toEqual({
      orderId: "order-1",
      providerPaymentId: "pix_1",
      status: "approved",
    });
  });

  it("checkout.completed também conta como pago", async () => {
    const outro = JSON.stringify({
      event: "checkout.completed",
      data: { id: "pix_2", externalId: "order-2" },
    });

    const result = await adapter.handleWebhook(
      outro,
      signedHeaders(SECRET, outro),
      connectionWith(fullCreds),
      urlWith(SECRET)
    );

    expect(result?.status).toBe("approved");
  });

  it("ignora evento desconhecido", async () => {
    const outro = JSON.stringify({ event: "billing.created", data: { externalId: "order-3" } });

    const result = await adapter.handleWebhook(
      outro,
      signedHeaders(SECRET, outro),
      connectionWith(fullCreds),
      urlWith(SECRET)
    );

    expect(result).toBeNull();
  });
});

describe("createCharge", () => {
  const order = {
    id: "order-1",
    total: 40.5,
    customerName: "Maria",
    paymentMethod: "PIX" as const,
    items: [{ menuItemId: "m1", name: "X-Bacon", quantity: 1, unitPrice: 40.5 }],
  };

  it("manda o valor em centavos", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ data: { id: "pix_1", brCode: "cola", brCodeBase64: "img" } }));

    await adapter.createCharge(order, connectionWith(fullCreds));

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).data.amount).toBe(4050);
  });

  it("devolve o QR code do PIX", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ data: { id: "pix_1", brCode: "cola-aqui", brCodeBase64: "imagem64" } })
    );

    const charge = await adapter.createCharge(order, connectionWith(fullCreds));

    expect(charge).toMatchObject({
      provider: "abacate_pay",
      status: "pending",
      paymentId: "pix_1",
      pixQrCode: "imagem64",
      pixCopyPaste: "cola-aqui",
    });
  });

  it("aceita resposta sem o envelope data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ id: "pix_9", brCode: "cola", brCodeBase64: "img" })
    );

    const charge = await adapter.createCharge(order, connectionWith(fullCreds));

    expect(charge.paymentId).toBe("pix_9");
  });

  it("não finge que cobrou quando o gateway falha", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Chave inválida" }), { status: 401 })
    );

    await expect(adapter.createCharge(order, connectionWith(fullCreds))).rejects.toThrow(
      /Chave inválida/
    );
  });
});
