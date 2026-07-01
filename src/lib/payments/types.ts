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
  status: "approved" | "rejected" | "cancelled" | "pending" | "unknown";
}

export interface PaymentProvider {
  // connection é null quando o tenant ainda não conectou a própria conta —
  // nesse caso o adapter deve usar a conta da plataforma, sem split.
  createCharge(order: ChargeableOrder, connection: PaymentConnection | null): Promise<Charge>;

  // Retorna null se o payload não for uma notificação de pagamento relevante
  // ou se a assinatura for inválida. requestId vem do header x-request-id,
  // parte do manifesto assinado junto com o header x-signature.
  handleWebhook(payload: unknown, signature: string | null, requestId: string | null): Promise<WebhookResult | null>;

  getOnboardingUrl(tenantId: string): Promise<string>;
  exchangeAuthorizationCode(code: string, tenantId: string): Promise<PaymentConnection>;
  refreshToken(connection: PaymentConnection): Promise<PaymentConnection>;
}
