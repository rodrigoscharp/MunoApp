import type { PaymentConnection } from "@prisma/client";

// Pedido em formato mínimo que qualquer adapter precisa pra cobrar —
// desacoplado do shape exato do model Prisma para não vazar detalhes de
// domínio pra dentro da camada de pagamento.
export interface ChargeableOrder {
  id: string;
  total: number;
  customerName: string;
  paymentMethod: "PIX" | "CREDIT_CARD";
  items: {
    menuItemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }[];
}

export interface Charge {
  provider: string;
  status: "pending" | "approved" | "rejected";
  paymentId: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
  checkoutUrl?: string;
}

export interface WebhookResult {
  orderId: string;
  providerPaymentId: string;
  status: "approved" | "rejected" | "cancelled" | "refunded" | "pending" | "unknown";
}

// Lançada quando a assinatura do webhook não bate — distinta de "payload
// não é uma notificação de pagamento relevante" (que retorna null e é OK
// responder 200). O caller deve responder 401/403 especificamente pra esse
// erro, nunca 200.
export class InvalidWebhookSignatureError extends Error {
  constructor() {
    super("Assinatura do webhook inválida");
    this.name = "InvalidWebhookSignatureError";
  }
}

export interface PaymentProvider {
  // connection é null quando o tenant ainda não conectou a própria conta —
  // nesse caso o adapter deve usar a conta da plataforma, sem split.
  createCharge(order: ChargeableOrder, connection: PaymentConnection | null): Promise<Charge>;

  // Retorna null se o payload não for uma notificação de pagamento relevante
  // (responder 200 normalmente). Lança InvalidWebhookSignatureError se a
  // assinatura não bater (o caller deve responder 401/403, nunca 200).
  // requestId vem do header x-request-id, parte do manifesto assinado
  // junto com o header x-signature.
  handleWebhook(payload: unknown, signature: string | null, requestId: string | null): Promise<WebhookResult | null>;

  getOnboardingUrl(tenantId: string): Promise<string>;
  exchangeAuthorizationCode(code: string, tenantId: string): Promise<PaymentConnection>;
  refreshToken(connection: PaymentConnection): Promise<PaymentConnection>;
}

export interface CredentialField {
  key: string;
  label: string;
  help: string;
  type: "text" | "secret" | "select";
  options?: { value: string; label: string }[];
  required: boolean;
}
