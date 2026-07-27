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

const BASE_URLS = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
} as const;

function baseUrlFor(environment: string | undefined): string {
  return environment === "production" ? BASE_URLS.production : BASE_URLS.sandbox;
}

// O Asaas autentica com a chave num header chamado literalmente
// "access_token" — não é Bearer.
function headersFor(apiKey: string): Record<string, string> {
  return { "Content-Type": "application/json", access_token: apiKey };
}

async function call<T>(
  baseUrl: string,
  apiKey: string,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: init?.method ?? "GET",
    headers: headersFor(apiKey),
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });

  if (!res.ok) {
    // O Asaas devolve { errors: [{ code, description }] }. Propaga a
    // descrição em vez de engolir: uma cobrança que falhou não pode virar
    // pedido "aguardando pagamento" pra sempre.
    const body = (await res.json().catch(() => null)) as
      | { errors?: { description?: string }[] }
      | null;
    const description = body?.errors?.[0]?.description;
    throw new Error(description ?? `Asaas respondeu ${res.status} em ${path}`);
  }

  return (await res.json()) as T;
}

// PAYMENT_CONFIRMED = pago, saldo ainda não liberado. PAYMENT_RECEIVED =
// pago e disponível. Os dois significam "o cliente pagou", que é o que o
// pedido precisa saber.
function mapEvent(event: string | undefined): WebhookResult["status"] {
  switch (event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
      return "approved";
    case "PAYMENT_REFUNDED":
    case "PAYMENT_CHARGEBACK_REQUESTED":
      return "refunded";
    case "PAYMENT_DELETED":
    case "PAYMENT_OVERDUE":
      return "cancelled";
    case "PAYMENT_CREATED":
    case "PAYMENT_AWAITING_RISK_ANALYSIS":
      return "pending";
    default:
      return "unknown";
  }
}

export class AsaasAdapter implements PaymentProvider {
  meta: PaymentProviderMeta = {
    id: "asaas",
    label: "Asaas",
    docsUrl: "https://www.asaas.com/customerConfigIntegrations",
    methods: ["PIX", "CREDIT_CARD"],
    requiresPayerDocument: true,
    brandColor: "#0057FF",
    recommended: true,
    setupSteps: [
      {
        title: "Gere sua chave de API",
        body: "No painel do Asaas, abra Integrações e gere uma chave de API. Use sandbox para testar sem mover dinheiro de verdade.",
        link: { label: "Abrir integrações do Asaas", url: "https://www.asaas.com/customerConfigIntegrations" },
      },
      {
        title: "Escolha o ambiente e cole a chave",
        body: "A chave precisa ser do mesmo ambiente selecionado. Chave de sandbox em produção não funciona, e vice-versa.",
        fills: ["apiKey", "environment"],
      },
      {
        title: "Cadastre a URL de webhook",
        body: "Em Integrações, crie um webhook para eventos de cobrança com a URL abaixo. Defina um token de sua escolha nesse cadastro.",
        showsWebhookUrl: true,
      },
      {
        title: "Cole o token que você definiu",
        body: "É o mesmo token do cadastro do webhook. O Asaas devolve ele em toda notificação, e é assim que confirmamos que a notificação é legítima.",
        fills: ["webhookSecret"],
      },
    ],
    credentialFields: [
      {
        key: "apiKey",
        label: "Chave de API",
        help: "No painel do Asaas: Integrações → API. Use a chave do mesmo ambiente selecionado abaixo.",
        type: "secret",
        required: true,
      },
      {
        key: "environment",
        label: "Ambiente",
        help: "Use sandbox para testar sem movimentar dinheiro de verdade.",
        type: "select",
        options: [
          { value: "sandbox", label: "Sandbox (teste)" },
          { value: "production", label: "Produção" },
        ],
        required: true,
      },
      {
        key: "webhookSecret",
        label: "Token do webhook",
        help: "Você define esse token ao cadastrar a URL de webhook no painel do Asaas. Ele volta em todas as notificações no header asaas-access-token.",
        type: "secret",
        required: false,
      },
    ],
  };

  async validateCredentials(credentials: Record<string, string>): Promise<CredentialCheck> {
    const apiKey = credentials.apiKey;
    if (!apiKey) return { ok: false, reason: "Informe a chave de API." };

    try {
      const account = await call<{ id?: string; name?: string }>(
        baseUrlFor(credentials.environment),
        apiKey,
        "/myAccount/commercialInfo"
      );
      return { ok: true, externalAccountId: account.id ? String(account.id) : undefined };
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      return {
        ok: false,
        reason: message.includes("401")
          ? "O Asaas recusou essa chave. Confira se ela é do ambiente selecionado."
          : "Não foi possível falar com o Asaas agora.",
      };
    }
  }

  async createCharge(order: ChargeableOrder, connection: PaymentConnection): Promise<Charge> {
    const { apiKey, environment } = decryptCredentials(connection.credentials);
    if (!apiKey) throw new Error("Conexão do Asaas sem chave de API.");

    // O Asaas não cria cobrança avulsa: exige um cliente cadastrado, e o
    // cadastro exige CPF. É por isso que o meta declara
    // requiresPayerDocument e o checkout pede o documento antes.
    if (!order.payerDocument) {
      throw new Error("O Asaas exige o CPF do pagador para emitir a cobrança.");
    }

    const baseUrl = baseUrlFor(environment);

    const customer = await call<{ id: string }>(baseUrl, apiKey, "/customers", {
      method: "POST",
      body: {
        name: order.customerName,
        cpfCnpj: order.payerDocument,
        externalReference: order.id,
        notificationDisabled: true,
      },
    });

    const payment = await call<{ id: string; invoiceUrl?: string }>(baseUrl, apiKey, "/payments", {
      method: "POST",
      body: {
        customer: customer.id,
        billingType: order.paymentMethod === "PIX" ? "PIX" : "CREDIT_CARD",
        value: order.total,
        // Cobrança de restaurante é para pagamento imediato; o Asaas exige
        // dueDate mesmo assim.
        dueDate: new Date().toISOString().slice(0, 10),
        description: `Pedido MUNO #${order.id.slice(-6).toUpperCase()}`,
        externalReference: order.id,
      },
    });

    if (order.paymentMethod === "PIX") {
      const qr = await call<{ encodedImage?: string; payload?: string }>(
        baseUrl,
        apiKey,
        `/payments/${payment.id}/pixQrCode`
      );

      return {
        provider: "asaas",
        status: "pending",
        paymentId: String(payment.id),
        pixQrCode: qr.encodedImage,
        pixCopyPaste: qr.payload,
      };
    }

    return {
      provider: "asaas",
      status: "pending",
      paymentId: String(payment.id),
      checkoutUrl: payment.invoiceUrl,
    };
  }

  async handleWebhook(
    rawBody: string,
    headers: Headers,
    connection: PaymentConnection
  ): Promise<WebhookResult | null> {
    // O Asaas autentica por token estático no header, não por assinatura do
    // corpo — o parse aqui é só pra ler o evento.
    const body = safeParse(rawBody) as {
      event?: string;
      payment?: { id?: string; externalReference?: string };
    } | null;
    if (!body?.event?.startsWith("PAYMENT_") || !body.payment?.id) return null;

    const { webhookSecret } = decryptCredentials(connection.credentials);

    // Sem token configurado, NÃO processa. O tenantId da URL é público e
    // não autentica nada — aceitar aqui deixaria qualquer um marcar pedido
    // como pago.
    if (!webhookSecret) {
      console.error(
        `[asaas] Tenant ${connection.tenantId} recebeu webhook sem webhookSecret configurado — recusando.`
      );
      throw new InvalidWebhookSignatureError();
    }

    const received = headers.get("asaas-access-token");
    if (!received || !timingSafeEquals(received, webhookSecret)) {
      console.error("[asaas] Token do webhook inválido — rejeitando notificação.");
      throw new InvalidWebhookSignatureError();
    }

    // Sem externalReference não há como saber a qual pedido a notificação
    // pertence — melhor ignorar do que adivinhar.
    const orderId = body.payment.externalReference;
    if (!orderId) return null;

    return {
      orderId,
      providerPaymentId: String(body.payment.id),
      status: mapEvent(body.event),
    };
  }
}

// timingSafeEqual lança RangeError com buffers de tamanhos diferentes
// (ex.: token forjado curto) — tratamos como token inválido.
function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
