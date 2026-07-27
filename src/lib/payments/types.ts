import type { PaymentConnection, PaymentMethod } from "@prisma/client";

// Pedido em formato mínimo que qualquer adapter precisa pra cobrar —
// desacoplado do shape exato do model Prisma para não vazar detalhes de
// domínio pra dentro da camada de pagamento.
export interface ChargeableOrder {
  id: string;
  total: number;
  customerName: string;
  // CPF do pagador. Só vem preenchido quando o gateway conectado exige
  // (meta.requiresPayerDocument) — não é persistido em lugar nenhum,
  // atravessa do checkout até o gateway e morre ali.
  payerDocument?: string;
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

export interface CredentialField {
  key: string;
  label: string;
  help: string;
  type: "text" | "secret" | "select";
  options?: { value: string; label: string }[];
  required: boolean;
}

export interface PaymentProviderMeta {
  id: string;
  label: string;
  docsUrl: string;
  methods: PaymentMethod[];
  credentialFields: CredentialField[];
  // Alguns gateways não emitem cobrança sem identificar o pagador. Quando
  // true, o checkout pede o CPF antes de cobrar — e só nesse caso, pra não
  // impor atrito a restaurante cujo gateway não precisa.
  requiresPayerDocument: boolean;
}

export type CredentialCheck =
  | { ok: true; externalAccountId?: string }
  | { ok: false; reason: string };

export interface PaymentProvider {
  meta: PaymentProviderMeta;

  // Só confirma o que a API do gateway sabe responder (token válido, de qual
  // conta). O webhook secret NÃO é verificável por API — ele só se prova na
  // primeira notificação recebida.
  validateCredentials(credentials: Record<string, string>): Promise<CredentialCheck>;

  // connection não é nullable: sem conexão não existe cobrança. Não há mais
  // fallback para conta da plataforma.
  createCharge(order: ChargeableOrder, connection: PaymentConnection): Promise<Charge>;

  // Recebe a connection porque o segredo de assinatura é de cada lojista.
  // Recebe Headers inteiro porque cada gateway assina com headers diferentes.
  handleWebhook(
    payload: unknown,
    headers: Headers,
    connection: PaymentConnection
  ): Promise<WebhookResult | null>;
}
