import crypto from "node:crypto";
import type { PaymentConnection } from "@prisma/client";
import { decryptCredentials } from "./credentials";
import { InvalidWebhookSignatureError, safeParse } from "./types";
import type {
  Charge,
  ChargeableOrder,
  CredentialCheck,
  PaymentProvider,
  PaymentProviderMeta,
  WebhookResult,
} from "./types";

const API = "https://api.stripe.com/v1";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

// A API da Stripe é form-encoded, não JSON, e usa colchetes pra aninhar.
function encodeForm(params: Record<string, string | number>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

async function call<T>(
  secretKey: string,
  path: string,
  body?: Record<string, string | number>
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(body ? { body: encodeForm(body) } : {}),
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(payload?.error?.message ?? `Stripe respondeu ${res.status} em ${path}`);
  }

  return (await res.json()) as T;
}

// A Stripe assina `${timestamp}.${corpo cru}` com HMAC-SHA256 e manda no
// header stripe-signature como "t=...,v1=...".
function isValidSignature(secret: string, header: string | null, rawBody: string): boolean {
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(",").map((piece) => {
      const [key, value] = piece.split("=");
      return [key?.trim(), value?.trim()];
    })
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signature);
  if (expectedBuf.length !== receivedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

export class StripeAdapter implements PaymentProvider {
  meta: PaymentProviderMeta = {
    id: "stripe",
    label: "Stripe",
    docsUrl: "https://dashboard.stripe.com/apikeys",
    // Só cartão: o PIX da Stripe precisa ser habilitado à parte na conta, e
    // uma sessão pedindo PIX numa conta sem PIX ativo falha na hora da
    // cobrança. Quem quer PIX conecta Mercado Pago, Asaas ou Abacate Pay.
    methods: ["CREDIT_CARD"],
    requiresPayerDocument: false,
    brandColor: "#635BFF",
    setupSteps: [
      {
        title: "Copie sua chave secreta",
        body: "No painel da Stripe, abra Desenvolvedores → Chaves de API e copie a chave secreta (começa com sk_).",
        link: { label: "Abrir chaves da Stripe", url: "https://dashboard.stripe.com/apikeys" },
        fills: ["secretKey"],
      },
      {
        title: "Cadastre a URL de webhook",
        body: "Em Desenvolvedores → Webhooks, adicione um endpoint com a URL abaixo e selecione o evento checkout.session.completed.",
        showsWebhookUrl: true,
        link: { label: "Abrir webhooks da Stripe", url: "https://dashboard.stripe.com/webhooks" },
      },
      {
        title: "Cole a chave de assinatura",
        body: "Depois de criar o endpoint, a Stripe mostra a signing secret (começa com whsec_). Cole aqui.",
        fills: ["webhookSecret"],
      },
    ],
    credentialFields: [
      {
        key: "secretKey",
        label: "Chave secreta",
        help: "Começa com sk_live_ em produção ou sk_test_ para testes.",
        type: "secret",
        required: true,
      },
      {
        key: "webhookSecret",
        label: "Chave de assinatura do webhook",
        help: "Começa com whsec_. A Stripe mostra ao criar o endpoint.",
        type: "secret",
        required: false,
      },
    ],
  };

  async validateCredentials(credentials: Record<string, string>): Promise<CredentialCheck> {
    const secretKey = credentials.secretKey;
    if (!secretKey) return { ok: false, reason: "Informe a chave secreta." };

    try {
      const account = await call<{ id?: string }>(secretKey, "/account");
      return { ok: true, externalAccountId: account.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      return {
        ok: false,
        reason: message || "A Stripe recusou essa chave.",
      };
    }
  }

  async createCharge(order: ChargeableOrder, connection: PaymentConnection): Promise<Charge> {
    const { secretKey } = decryptCredentials(connection.credentials);
    if (!secretKey) throw new Error("Conexão da Stripe sem chave secreta.");

    // Checkout Session hospedada: o cliente é redirecionado, paga lá e
    // volta. Valor em centavos, como a Stripe exige.
    const session = await call<{ id: string; url?: string }>(secretKey, "/checkout/sessions", {
      mode: "payment",
      "payment_method_types[0]": "card",
      "line_items[0][price_data][currency]": "brl",
      "line_items[0][price_data][product_data][name]": `Pedido MUNO #${order.id
        .slice(-6)
        .toUpperCase()}`,
      "line_items[0][price_data][unit_amount]": Math.round(order.total * 100),
      "line_items[0][quantity]": 1,
      client_reference_id: order.id,
      success_url: `${APP_URL}/track/${order.id}?payment=success`,
      cancel_url: `${APP_URL}/track/${order.id}?payment=failure`,
    });

    return {
      provider: "stripe",
      status: "pending",
      paymentId: session.id,
      checkoutUrl: session.url,
    };
  }

  async handleWebhook(
    rawBody: string,
    headers: Headers,
    connection: PaymentConnection
  ): Promise<WebhookResult | null> {
    const { webhookSecret } = decryptCredentials(connection.credentials);

    // Sem segredo configurado, NÃO processa: o tenantId da URL é público e
    // não autentica nada.
    if (!webhookSecret) {
      console.error(
        `[stripe] Tenant ${connection.tenantId} recebeu webhook sem webhookSecret configurado — recusando.`
      );
      throw new InvalidWebhookSignatureError();
    }

    // A assinatura é sobre o corpo CRU — validar antes de parsear.
    if (!isValidSignature(webhookSecret, headers.get("stripe-signature"), rawBody)) {
      console.error("[stripe] Assinatura do webhook inválida — rejeitando notificação.");
      throw new InvalidWebhookSignatureError();
    }

    const event = safeParse(rawBody) as {
      type?: string;
      data?: { object?: { id?: string; client_reference_id?: string } };
    } | null;

    const object = event?.data?.object;
    if (!object?.client_reference_id) return null;

    const status = mapEvent(event?.type);
    if (status === "unknown") return null;

    return {
      orderId: object.client_reference_id,
      providerPaymentId: String(object.id),
      status,
    };
  }
}

function mapEvent(type: string | undefined): WebhookResult["status"] {
  switch (type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return "approved";
    case "checkout.session.async_payment_failed":
      return "rejected";
    case "checkout.session.expired":
      return "cancelled";
    case "charge.refunded":
      return "refunded";
    default:
      return "unknown";
  }
}
