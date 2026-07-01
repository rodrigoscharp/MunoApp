import crypto from "node:crypto";
import { MercadoPagoConfig, OAuth, Payment, Preference } from "mercadopago";
import type { PaymentConnection } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import { signOAuthState } from "@/lib/oauth-state";
import type { Charge, ChargeableOrder, PaymentProvider, WebhookResult } from "./types";

const PLATFORM_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const CLIENT_ID = process.env.MERCADOPAGO_CLIENT_ID;
const CLIENT_SECRET = process.env.MERCADOPAGO_CLIENT_SECRET;
const WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

// Percentual de comissão da Muno sobre pedidos de tenants já conectados via
// marketplace. Só é aplicado quando existe uma PaymentConnection — sem
// conexão, o adapter cai no token da própria plataforma e não há split.
const PLATFORM_COMMISSION_PERCENT = Number(process.env.PLATFORM_COMMISSION_PERCENT ?? "5");

function configFor(connection: PaymentConnection | null): MercadoPagoConfig {
  const accessToken = connection?.accessToken ?? PLATFORM_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado e tenant sem conta conectada.");
  }
  return new MercadoPagoConfig({ accessToken });
}

function calculateCommission(total: number, connection: PaymentConnection | null): number | undefined {
  if (!connection) return undefined;
  return Number(((total * PLATFORM_COMMISSION_PERCENT) / 100).toFixed(2));
}

function mapPaymentStatus(status: string | undefined): WebhookResult["status"] {
  switch (status) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
    case "pending":
    case "in_process":
      return "pending";
    default:
      return "unknown";
  }
}

// Valida a assinatura do webhook do MP (header x-signature: "ts=...,v1=...").
// Ver https://www.mercadopago.com.br/developers/pt/docs/checkout-api/webhooks#editor_5
function isValidSignature(signature: string | null, requestId: string | null, dataId: string | null): boolean {
  if (!WEBHOOK_SECRET) {
    // Sem secret configurado ainda — não bloqueia (compatível com o setup
    // atual), mas fica registrado pra não passar despercebido.
    console.warn("[mercadopago] MERCADOPAGO_WEBHOOK_SECRET não configurado — assinatura do webhook não validada.");
    return true;
  }
  if (!signature) return false;

  const parts = Object.fromEntries(
    signature.split(",").map((p) => {
      const [key, value] = p.split("=");
      return [key?.trim(), value?.trim()];
    })
  );
  const ts = parts.ts;
  const hash = parts.v1;
  if (!ts || !hash) return false;

  const manifest = `id:${dataId ?? ""};request-id:${requestId ?? ""};ts:${ts};`;
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(manifest).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
}

export class MercadoPagoAdapter implements PaymentProvider {
  async createCharge(order: ChargeableOrder, connection: PaymentConnection | null): Promise<Charge> {
    const mp = configFor(connection);
    const applicationFee = calculateCommission(order.total, connection);

    if (order.paymentMethod === "PIX") {
      const paymentApi = new Payment(mp);
      const pixPayment = await paymentApi.create({
        body: {
          transaction_amount: order.total,
          description: `Pedido MUNO #${order.id.slice(-6).toUpperCase()}`,
          payment_method_id: "pix",
          payer: {
            email: "cliente@muno.com",
            first_name: order.customerName.split(" ")[0],
            last_name: order.customerName.split(" ").slice(1).join(" ") || ".",
          },
          external_reference: order.id,
          notification_url: `${APP_URL}/api/payments/webhook`,
          ...(applicationFee ? { application_fee: applicationFee } : {}),
        },
      });

      const pixData = pixPayment.point_of_interaction?.transaction_data;

      return {
        provider: "mercado_pago",
        status: "pending",
        paymentId: String(pixPayment.id),
        pixQrCode: pixData?.qr_code_base64,
        pixCopyPaste: pixData?.qr_code,
      };
    }

    // CREDIT_CARD: Preference (Checkout Pro, redireciona pro checkout do MP)
    const preferenceApi = new Preference(mp);
    const preference = await preferenceApi.create({
      body: {
        items: order.items.map((item) => ({
          id: item.menuItemId,
          title: item.name,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          currency_id: "BRL",
        })),
        payer: { name: order.customerName },
        external_reference: order.id,
        notification_url: `${APP_URL}/api/payments/webhook`,
        back_urls: {
          success: `${APP_URL}/track/${order.id}?payment=success`,
          failure: `${APP_URL}/track/${order.id}?payment=failure`,
          pending: `${APP_URL}/track/${order.id}?payment=pending`,
        },
        auto_return: "approved",
        ...(applicationFee ? { marketplace_fee: applicationFee } : {}),
      },
    });

    return {
      provider: "mercado_pago",
      status: "pending",
      paymentId: String(preference.id),
      checkoutUrl: preference.init_point ?? undefined,
    };
  }

  async handleWebhook(payload: unknown, signature: string | null, requestId: string | null): Promise<WebhookResult | null> {
    const body = payload as { type?: string; data?: { id?: string } };
    if (body?.type !== "payment" || !body?.data?.id) return null;

    if (!isValidSignature(signature, requestId, body.data.id)) {
      console.error("[mercadopago] Assinatura do webhook inválida — ignorando notificação.");
      return null;
    }

    // O token usado aqui é sempre o da plataforma: a Muno é sempre
    // aplicação/co-titular do pagamento (mesmo em cobranças com split), então
    // consegue consultar qualquer pagamento originado pelos seus tenants.
    if (!PLATFORM_ACCESS_TOKEN) {
      throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");
    }
    const mp = new MercadoPagoConfig({ accessToken: PLATFORM_ACCESS_TOKEN });
    const paymentApi = new Payment(mp);
    const payment = await paymentApi.get({ id: body.data.id });

    const orderId = payment.external_reference;
    if (!orderId) return null;

    return {
      orderId,
      providerPaymentId: String(payment.id),
      status: mapPaymentStatus(payment.status),
    };
  }

  async getOnboardingUrl(tenantId: string): Promise<string> {
    if (!CLIENT_ID) {
      throw new Error(
        "MERCADOPAGO_CLIENT_ID não configurado — crie a Aplicação MP para Marketplace antes de habilitar o onboarding."
      );
    }
    if (!PLATFORM_ACCESS_TOKEN) {
      throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");
    }

    // state assinado (HMAC + expiração) — o callback valida antes de
    // confiar no tenantId embutido nele (ver src/lib/oauth-state.ts).
    const state = signOAuthState(tenantId);

    const mp = new MercadoPagoConfig({ accessToken: PLATFORM_ACCESS_TOKEN });
    const oauth = new OAuth(mp);
    return oauth.getAuthorizationURL({
      options: {
        client_id: CLIENT_ID,
        redirect_uri: `${APP_URL}/api/payments/callback`,
        state,
      },
    });
  }

  async exchangeAuthorizationCode(code: string, tenantId: string): Promise<PaymentConnection> {
    if (!CLIENT_ID || !CLIENT_SECRET || !PLATFORM_ACCESS_TOKEN) {
      throw new Error("Aplicação MP Marketplace não configurada (client id/secret/access token ausentes).");
    }

    const mp = new MercadoPagoConfig({ accessToken: PLATFORM_ACCESS_TOKEN });
    const oauth = new OAuth(mp);
    const result = await oauth.create({
      body: {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: `${APP_URL}/api/payments/callback`,
      },
    });

    if (!result.access_token || !result.refresh_token || !result.expires_in) {
      throw new Error("Resposta inesperada do Mercado Pago ao trocar o code por token.");
    }

    return prismaUnscoped.paymentConnection.upsert({
      where: { tenantId_provider: { tenantId, provider: "mercado_pago" } },
      update: {
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        expiresAt: new Date(Date.now() + result.expires_in * 1000),
        status: "active",
        mpUserId: result.user_id ? String(result.user_id) : null,
      },
      create: {
        tenantId,
        provider: "mercado_pago",
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        expiresAt: new Date(Date.now() + result.expires_in * 1000),
        mpUserId: result.user_id ? String(result.user_id) : null,
      },
    });
  }

  async refreshToken(connection: PaymentConnection): Promise<PaymentConnection> {
    if (!CLIENT_ID || !CLIENT_SECRET || !PLATFORM_ACCESS_TOKEN) {
      throw new Error("Aplicação MP Marketplace não configurada (client id/secret/access token ausentes).");
    }

    const mp = new MercadoPagoConfig({ accessToken: PLATFORM_ACCESS_TOKEN });
    const oauth = new OAuth(mp);

    try {
      const result = await oauth.refresh({
        body: {
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          refresh_token: connection.refreshToken,
        },
      });

      if (!result.access_token || !result.refresh_token || !result.expires_in) {
        throw new Error("Resposta inesperada do Mercado Pago ao renovar o token.");
      }

      return await prismaUnscoped.paymentConnection.update({
        where: { id: connection.id },
        data: {
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
          expiresAt: new Date(Date.now() + result.expires_in * 1000),
          status: "active",
        },
      });
    } catch (err) {
      console.error(`[mercadopago] Falha ao renovar token do tenant ${connection.tenantId}:`, err);
      return prismaUnscoped.paymentConnection.update({
        where: { id: connection.id },
        data: { status: "needs_reauth" },
      });
    }
  }
}
