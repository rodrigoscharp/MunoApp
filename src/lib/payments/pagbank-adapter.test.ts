import { describe, expect, it, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import { PagBankAdapter } from "@/lib/payments/pagbank-adapter";
import { encryptCredentials } from "@/lib/payments/credentials";
import { InvalidWebhookSignatureError } from "@/lib/payments/types";
import type { PaymentConnection } from "@prisma/client";

const TOKEN = "token-de-autenticidade";

function connectionWith(creds: Record<string, string>): PaymentConnection {
  return {
    id: "conn-1",
    tenantId: "tenant-1",
    provider: "pagbank",
    credentials: encryptCredentials(creds),
    externalAccountId: null,
    status: "active",
    lastCheckedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const fullCreds = { apiToken: "api-token", environment: "sandbox", webhookToken: TOKEN };

const body = JSON.stringify({
  id: "ORDE_1",
  reference_id: "order-1",
  charges: [{ id: "CHAR_1", status: "PAID" }],
});

// O PagBank assina SHA-256 sobre "<token>-<corpo cru>".
function signedHeaders(token: string, rawBody: string): Headers {
  return new Headers({
    "x-authenticity-token": crypto
      .createHash("sha256")
      .update(`${token}-${rawBody}`)
      .digest("hex"),
  });
}

const adapter = new PagBankAdapter();

beforeEach(() => vi.restoreAllMocks());

describe("handleWebhook — autenticidade", () => {
  it("RECUSA quando o lojista não configurou o token de autenticidade", async () => {
    await expect(
      adapter.handleWebhook(body, signedHeaders(TOKEN, body), connectionWith({ apiToken: "t" }))
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa hash gerado com outro token", async () => {
    await expect(
      adapter.handleWebhook(body, signedHeaders("token-errado", body), connectionWith(fullCreds))
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa header ausente", async () => {
    await expect(
      adapter.handleWebhook(body, new Headers(), connectionWith(fullCreds))
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa corpo adulterado depois de assinado", async () => {
    const headers = signedHeaders(TOKEN, body);
    const adulterado = JSON.stringify({
      id: "ORDE_1",
      reference_id: "order-DO-ATACANTE",
      charges: [{ id: "CHAR_1", status: "PAID" }],
    });

    await expect(
      adapter.handleWebhook(adulterado, headers, connectionWith(fullCreds))
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa hash de tamanho diferente sem estourar RangeError", async () => {
    const headers = new Headers({ "x-authenticity-token": "abc" });

    await expect(
      adapter.handleWebhook(body, headers, connectionWith(fullCreds))
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });
});

describe("handleWebhook — caminho feliz", () => {
  it("com hash certo, devolve o pedido e a cobrança", async () => {
    const result = await adapter.handleWebhook(
      body,
      signedHeaders(TOKEN, body),
      connectionWith(fullCreds)
    );

    expect(result).toEqual({
      orderId: "order-1",
      providerPaymentId: "CHAR_1",
      status: "approved",
    });
  });

  it("cobrança ainda aguardando não vira pago", async () => {
    const aguardando = JSON.stringify({
      id: "ORDE_2",
      reference_id: "order-2",
      charges: [{ id: "CHAR_2", status: "WAITING" }],
    });

    const result = await adapter.handleWebhook(
      aguardando,
      signedHeaders(TOKEN, aguardando),
      connectionWith(fullCreds)
    );

    expect(result?.status).toBe("pending");
  });

  it("notificação sem reference_id é ignorada", async () => {
    const semRef = JSON.stringify({ id: "ORDE_3", charges: [{ id: "C", status: "PAID" }] });

    const result = await adapter.handleWebhook(
      semRef,
      signedHeaders(TOKEN, semRef),
      connectionWith(fullCreds)
    );

    expect(result).toBeNull();
  });
});

describe("createCharge", () => {
  const order = {
    id: "order-1",
    total: 40.5,
    customerName: "Maria Silva",
    payerDocument: "52998224725",
    paymentMethod: "PIX" as const,
    items: [{ menuItemId: "m1", name: "X-Bacon", quantity: 1, unitPrice: 40.5 }],
  };

  const okResponse = {
    id: "ORDE_1",
    qr_codes: [
      {
        text: "00020101021226830014br.gov.bcb.pix",
        links: [
          { rel: "QRCODE.PNG", href: "https://pagbank/qr.png" },
          { rel: "QRCODE.BASE64", href: "https://pagbank/qr.base64" },
        ],
      },
    ],
  };

  it("exige o CPF do pagador", async () => {
    await expect(
      adapter.createCharge({ ...order, payerDocument: undefined }, connectionWith(fullCreds))
    ).rejects.toThrow(/CPF/i);
  });

  it("manda valores em centavos", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(okResponse));

    await adapter.createCharge(order, connectionWith(fullCreds));

    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(sent.qr_codes[0].amount.value).toBe(4050);
    expect(sent.items[0].unit_amount).toBe(4050);
  });

  it("usa o ambiente sandbox quando configurado", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(okResponse));

    await adapter.createCharge(order, connectionWith(fullCreds));

    expect(String(fetchMock.mock.calls[0][0])).toContain("sandbox.api.pagseguro.com");
  });

  it("liga o pedido pelo reference_id e aponta o webhook pro tenant", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(okResponse));

    await adapter.createCharge(order, connectionWith(fullCreds));

    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(sent.reference_id).toBe("order-1");
    expect(sent.notification_urls[0]).toContain("/api/payments/webhook/pagbank/tenant-1");
  });

  it("devolve o copia-e-cola do PIX", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(okResponse));

    const charge = await adapter.createCharge(order, connectionWith(fullCreds));

    expect(charge).toMatchObject({
      provider: "pagbank",
      status: "pending",
      paymentId: "ORDE_1",
      pixCopyPaste: "00020101021226830014br.gov.bcb.pix",
    });
  });

  it("não finge que cobrou quando o PagBank recusa", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error_messages: [{ description: "Token inválido" }] }), {
        status: 401,
      })
    );

    await expect(adapter.createCharge(order, connectionWith(fullCreds))).rejects.toThrow(
      /Token inválido/
    );
  });
});

describe("validateCredentials", () => {
  it("recusa token que o PagBank rejeita", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 401 }));

    const check = await adapter.validateCredentials({ apiToken: "ruim", environment: "sandbox" });

    expect(check.ok).toBe(false);
  });

  it("aceita token que o PagBank não rejeita", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));

    const check = await adapter.validateCredentials({ apiToken: "bom", environment: "sandbox" });

    expect(check.ok).toBe(true);
  });
});
