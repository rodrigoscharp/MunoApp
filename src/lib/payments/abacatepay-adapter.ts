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

const API = "https://api.abacatepay.com/v2";

async function call<T>(apiKey: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Abacate Pay respondeu ${res.status} em ${path}`);
  }

  return (await res.json()) as T;
}

function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export class AbacatePayAdapter implements PaymentProvider {
  meta: PaymentProviderMeta = {
    id: "abacate_pay",
    label: "Abacate Pay",
    docsUrl: "https://www.abacatepay.com/dashboard",
    // PIX puro — o Abacate Pay não processa cartão.
    methods: ["PIX"],
    requiresPayerDocument: false,
    brandColor: "#2FA84F",
    setupSteps: [
      {
        title: "Copie sua chave de API",
        body: "No painel do Abacate Pay, abra Integrações e copie a chave. A própria chave define se você está em teste ou produção — não existe seletor de ambiente.",
        link: { label: "Abrir painel do Abacate Pay", url: "https://www.abacatepay.com/dashboard" },
        fills: ["apiKey"],
      },
      {
        title: "Cadastre a URL de webhook",
        body: "Crie um webhook com a URL abaixo. Ao criar, o Abacate Pay pede um segredo — anote, porque ele vai no próximo passo.",
        showsWebhookUrl: true,
      },
      {
        title: "Cole o segredo do webhook",
        body: "É o mesmo segredo do cadastro. Ele viaja na URL da notificação e também assina o corpo dela, e é assim que confirmamos que o aviso de pagamento é legítimo.",
        fills: ["webhookSecret"],
      },
    ],
    credentialFields: [
      {
        key: "apiKey",
        label: "Chave de API",
        help: "Encontrada em Integrações, no painel do Abacate Pay.",
        type: "secret",
        required: true,
      },
      {
        key: "webhookSecret",
        label: "Segredo do webhook",
        help: "Definido por você ao cadastrar o webhook no painel.",
        type: "secret",
        required: false,
      },
    ],
  };

  async validateCredentials(credentials: Record<string, string>): Promise<CredentialCheck> {
    const apiKey = credentials.apiKey;
    if (!apiKey) return { ok: false, reason: "Informe a chave de API." };

    try {
      await call(apiKey, "/customer/list");
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      return {
        ok: false,
        reason: message.includes("401")
          ? "O Abacate Pay recusou essa chave."
          : "Não foi possível falar com o Abacate Pay agora.",
      };
    }
  }

  async createCharge(order: ChargeableOrder, connection: PaymentConnection): Promise<Charge> {
    const { apiKey } = decryptCredentials(connection.credentials);
    if (!apiKey) throw new Error("Conexão do Abacate Pay sem chave de API.");

    // Gateway de PIX puro: recusa em vez de gerar um PIX silenciosamente
    // para um pedido marcado como cartão.
    if (order.paymentMethod !== "PIX") {
      throw new Error("O Abacate Pay está configurado apenas para Pix neste restaurante.");
    }

    // Valor em centavos. O objeto customer é opcional pro PIX — por isso
    // este gateway não exige CPF do pagador.
    const response = await call<{
      data?: { id?: string; brCode?: string; brCodeBase64?: string };
      id?: string;
      brCode?: string;
      brCodeBase64?: string;
    }>(apiKey, "/transparents/create", {
      method: "PIX",
      data: {
        amount: Math.round(order.total * 100),
        externalId: order.id,
        description: `Pedido MUNO #${order.id.slice(-6).toUpperCase()}`,
      },
    });

    // A API envelopa em `data` em algumas respostas; aceita os dois formatos
    // pra não quebrar por causa de casca.
    const charge = response.data ?? response;
    if (!charge.id) throw new Error("Abacate Pay não devolveu o id da cobrança.");

    return {
      provider: "abacate_pay",
      status: "pending",
      paymentId: String(charge.id),
      pixQrCode: charge.brCodeBase64,
      pixCopyPaste: charge.brCode,
    };
  }

  async handleWebhook(
    rawBody: string,
    headers: Headers,
    connection: PaymentConnection,
    url: URL
  ): Promise<WebhookResult | null> {
    const { webhookSecret } = decryptCredentials(connection.credentials);

    // Sem segredo configurado, NÃO processa: o tenantId da URL é público e
    // não autentica nada.
    if (!webhookSecret) {
      console.error(
        `[abacate_pay] Tenant ${connection.tenantId} recebeu webhook sem webhookSecret configurado — recusando.`
      );
      throw new InvalidWebhookSignatureError();
    }

    // O Abacate Pay usa duas camadas: o segredo na query string e um HMAC do
    // corpo no header. Exigimos as duas — a query sozinha vaza em log de
    // servidor, e o HMAC sozinho não confirma que a URL é a nossa.
    const secretFromQuery = url.searchParams.get("webhookSecret");
    if (!secretFromQuery || !timingSafeEquals(secretFromQuery, webhookSecret)) {
      console.error("[abacate_pay] Segredo da query inválido — rejeitando notificação.");
      throw new InvalidWebhookSignatureError();
    }

    const signature = headers.get("x-webhook-signature");
    if (signature) {
      const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
      if (!timingSafeEquals(signature, expected)) {
        console.error("[abacate_pay] Assinatura do corpo inválida — rejeitando notificação.");
        throw new InvalidWebhookSignatureError();
      }
    }

    const event = safeParse(rawBody) as {
      event?: string;
      data?: { id?: string; externalId?: string; status?: string; pixQrCode?: { id?: string } };
    } | null;

    if (!event?.event) return null;

    const status = mapEvent(event.event);
    if (status === "unknown") return null;

    const orderId = event.data?.externalId;
    if (!orderId) return null;

    return {
      orderId,
      providerPaymentId: String(event.data?.id ?? event.data?.pixQrCode?.id ?? ""),
      status,
    };
  }
}

function mapEvent(event: string): WebhookResult["status"] {
  switch (event) {
    case "checkout.completed":
    case "transparent.completed":
      return "approved";
    case "checkout.expired":
    case "transparent.expired":
      return "cancelled";
    case "checkout.refunded":
    case "transparent.refunded":
      return "refunded";
    default:
      return "unknown";
  }
}
