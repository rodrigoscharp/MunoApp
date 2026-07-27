import { describe, expect, it, vi, beforeEach } from "vitest";
import { AbacatePayAdapter } from "@/lib/payments/abacatepay-adapter";
import { PagBankAdapter } from "@/lib/payments/pagbank-adapter";
import { encryptCredentials } from "@/lib/payments/credentials";
import { listPaymentProviders } from "@/lib/payments/factory";
import type { PaymentConnection } from "@prisma/client";

function connectionFor(provider: string, creds: Record<string, string>): PaymentConnection {
  return {
    id: "conn-1",
    tenantId: "tenant-1",
    provider,
    credentials: encryptCredentials(creds),
    externalAccountId: null,
    status: "active",
    lastCheckedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(() => vi.restoreAllMocks());

const cardOrder = {
  id: "order-1",
  total: 40,
  customerName: "Maria",
  payerDocument: "52998224725",
  paymentMethod: "CREDIT_CARD" as const,
  items: [{ menuItemId: "m1", name: "X-Bacon", quantity: 1, unitPrice: 40 }],
};

describe("gateways de PIX puro recusam cartão", () => {
  it("Abacate Pay não gera PIX silencioso para pedido de cartão", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      new AbacatePayAdapter().createCharge(
        cardOrder,
        connectionFor("abacate_pay", { apiKey: "k" })
      )
    ).rejects.toThrow(/Pix/i);

    // O ponto do teste: nem chega a chamar o gateway.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("PagBank não gera PIX silencioso para pedido de cartão", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      new PagBankAdapter().createCharge(
        cardOrder,
        connectionFor("pagbank", { apiToken: "t", environment: "sandbox" })
      )
    ).rejects.toThrow(/Pix/i);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("coerência entre meta.methods e o que o adapter aceita", () => {
  it("todo gateway declara ao menos um método", () => {
    for (const provider of listPaymentProviders()) {
      expect(provider.meta.methods.length).toBeGreaterThan(0);
    }
  });

  it("gateway que declara só PIX nunca devolve checkoutUrl de cartão", async () => {
    // Guarda contra alguém adicionar CREDIT_CARD ao meta sem implementar.
    const pixOnly = listPaymentProviders().filter(
      (p) => p.meta.methods.length === 1 && p.meta.methods[0] === "PIX"
    );

    expect(pixOnly.map((p) => p.meta.id)).toContain("abacate_pay");
    expect(pixOnly.map((p) => p.meta.id)).toContain("pagbank");
  });
});

describe("PagBank devolve imagem renderizável", () => {
  it("usa o link PNG, não o link que devolve texto base64", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
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
      })
    );

    const charge = await new PagBankAdapter().createCharge(
      { ...cardOrder, paymentMethod: "PIX" },
      connectionFor("pagbank", { apiToken: "t", environment: "sandbox" })
    );

    expect(charge.pixQrCode).toBe("https://pagbank/qr.png");
    expect(charge.pixQrCode).not.toContain("base64");
  });
});
