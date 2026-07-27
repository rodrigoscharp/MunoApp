import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { MercadoPagoAdapter } from "@/lib/payments/mercadopago-adapter";
import { encryptCredentials } from "@/lib/payments/credentials";
import { InvalidWebhookSignatureError } from "@/lib/payments/types";
import type { PaymentConnection } from "@prisma/client";

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
