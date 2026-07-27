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
  sandbox: "https://sandbox.api.pagseguro.com",
  production: "https://api.pagseguro.com",
} as const;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

function baseUrlFor(environment: string | undefined): string {
  return environment === "production" ? BASE_URLS.production : BASE_URLS.sandbox;
}

async function call<T>(
  baseUrl: string,
  token: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as
      | { error_messages?: { description?: string }[] }
      | null;
    const description = payload?.error_messages?.[0]?.description;
    throw new Error(description ?? `PagBank respondeu ${res.status} em ${path}`);
  }

  return (await res.json()) as T;
}

export class PagBankAdapter implements PaymentProvider {
  meta: PaymentProviderMeta = {
    id: "pagbank",
    label: "PagBank",
    docsUrl: "https://minhaconta.pagbank.com.br",
    // Só PIX: o endpoint de QR Code do PagBank aceita apenas esse método.
    // Cartão exigiria o fluxo de charges com dados do cartão, que puxa
    // responsabilidade de PCI pra dentro do app.
    methods: ["PIX"],
    // O objeto customer do pedido exige tax_id.
    requiresPayerDocument: true,
    brandColor: "#00A868",
    setupSteps: [
      {
        title: "Gere um token de API",
        body: "Entre na sua conta PagBank, abra Vendas → Integrações → Gerar token de API e copie o valor.",
        link: { label: "Abrir conta PagBank", url: "https://minhaconta.pagbank.com.br" },
      },
      {
        title: "Escolha o ambiente e cole o token",
        body: "Token de sandbox só funciona em sandbox, e o de produção só em produção. Comece por sandbox para testar sem mover dinheiro.",
        fills: ["apiToken", "environment"],
      },
      {
        title: "Cadastre a URL de notificação",
        body: "Ainda em Integrações, cadastre a URL abaixo para receber os avisos de pagamento.",
        showsWebhookUrl: true,
      },
      {
        title: "Cole o token de autenticidade",
        body: "É o token que o PagBank usa para assinar as notificações, disponível junto das configurações de notificação da sua conta.",
        fills: ["webhookToken"],
      },
    ],
    credentialFields: [
      {
        key: "apiToken",
        label: "Token de API",
        help: "Gerado em Vendas → Integrações, na sua conta PagBank.",
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
        key: "webhookToken",
        label: "Token de autenticidade",
        help: "Usado para conferir que a notificação veio mesmo do PagBank.",
        type: "secret",
        required: false,
      },
    ],
  };

  async validateCredentials(credentials: Record<string, string>): Promise<CredentialCheck> {
    const token = credentials.apiToken;
    if (!token) return { ok: false, reason: "Informe o token de API." };

    // O PagBank não expõe um endpoint de "quem sou eu". Consultamos a lista
    // de pedidos: qualquer resposta que não seja 401/403 significa que o
    // token foi aceito — inclusive um 404, que já é resposta autenticada.
    try {
      const res = await fetch(`${baseUrlFor(credentials.environment)}/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          reason: "O PagBank recusou esse token. Confira se ele é do ambiente selecionado.",
        };
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: "Não foi possível falar com o PagBank agora." };
    }
  }

  async createCharge(order: ChargeableOrder, connection: PaymentConnection): Promise<Charge> {
    const { apiToken, environment } = decryptCredentials(connection.credentials);
    if (!apiToken) throw new Error("Conexão do PagBank sem token de API.");

    if (order.paymentMethod !== "PIX") {
      throw new Error("O PagBank está configurado apenas para Pix neste restaurante.");
    }

    if (!order.payerDocument) {
      throw new Error("O PagBank exige o CPF do pagador para emitir a cobrança.");
    }

    const response = await call<{
      id: string;
      qr_codes?: { text?: string; links?: { rel?: string; href?: string }[] }[];
    }>(baseUrlFor(environment), apiToken, "/orders", {
      reference_id: order.id,
      customer: {
        name: order.customerName,
        // O PagBank exige e-mail no customer. O pedido do restaurante não
        // coleta e-mail do cliente, então mandamos um endereço da própria
        // aplicação — o comprovante que importa é o do restaurante.
        email: "pedidos@muno.app",
        tax_id: order.payerDocument,
      },
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit_amount: Math.round(item.unitPrice * 100),
      })),
      qr_codes: [{ amount: { value: Math.round(order.total * 100) } }],
      notification_urls: [`${APP_URL}/api/payments/webhook/pagbank/${connection.tenantId}`],
    });

    const qr = response.qr_codes?.[0];
    // O PagBank hospeda a imagem e devolve links. Usamos o PNG, que é imagem
    // de verdade — o link QRCODE.BASE64 devolve texto base64 no corpo, então
    // não serve como src de <img>.
    const pngLink = qr?.links?.find((link) => link.rel === "QRCODE.PNG")?.href;

    return {
      provider: "pagbank",
      status: "pending",
      paymentId: String(response.id),
      pixQrCode: pngLink,
      pixCopyPaste: qr?.text,
    };
  }

  async handleWebhook(
    rawBody: string,
    headers: Headers,
    connection: PaymentConnection
  ): Promise<WebhookResult | null> {
    const { webhookToken } = decryptCredentials(connection.credentials);

    // Sem token configurado, NÃO processa: o tenantId da URL é público e
    // não autentica nada.
    if (!webhookToken) {
      console.error(
        `[pagbank] Tenant ${connection.tenantId} recebeu webhook sem token de autenticidade configurado — recusando.`
      );
      throw new InvalidWebhookSignatureError();
    }

    // O PagBank assina SHA-256 sobre "<token>-<corpo cru>". O corpo precisa
    // ser exatamente o recebido: qualquer reformatação muda o hash.
    const received = headers.get("x-authenticity-token");
    const expected = crypto
      .createHash("sha256")
      .update(`${webhookToken}-${rawBody}`)
      .digest("hex");

    if (!received || !timingSafeEquals(received, expected)) {
      console.error("[pagbank] Assinatura da notificação inválida — rejeitando.");
      throw new InvalidWebhookSignatureError();
    }

    const event = safeParse(rawBody) as {
      id?: string;
      reference_id?: string;
      charges?: { id?: string; status?: string }[];
    } | null;

    const orderId = event?.reference_id;
    if (!orderId) return null;

    const charge = event?.charges?.[0];
    const status = mapStatus(charge?.status);
    if (status === "unknown") return null;

    return {
      orderId,
      providerPaymentId: String(charge?.id ?? event?.id ?? ""),
      status,
    };
  }
}

function mapStatus(status: string | undefined): WebhookResult["status"] {
  switch (status) {
    case "PAID":
    case "AVAILABLE":
      return "approved";
    case "DECLINED":
      return "rejected";
    case "CANCELED":
      return "cancelled";
    case "REFUNDED":
      return "refunded";
    case "WAITING":
    case "IN_ANALYSIS":
      return "pending";
    default:
      return "unknown";
  }
}

function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
