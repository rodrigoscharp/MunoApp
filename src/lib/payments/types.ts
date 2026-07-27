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
  // Cor da marca, usada no tile do painel. Aproximação da paleta oficial —
  // não é asset de marca, é só um identificador visual.
  brandColor: string;
  // O passo a passo de configuração, na ordem real em que o lojista precisa
  // executar. A tela numera e marca o que já está feito.
  setupSteps: SetupStep[];
}

export interface SetupStep {
  title: string;
  body: string;
  link?: { label: string; url: string };
  // Quais campos de credencial este passo entrega. A tela usa isso pra
  // mostrar o passo como concluído quando o campo já está salvo.
  fills?: string[];
  // Passo que consiste em cadastrar a URL de webhook no painel do gateway.
  showsWebhookUrl?: boolean;
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

  // Recebe o corpo CRU, não o JSON parseado: Stripe e Abacate Pay assinam
  // o texto exato do body, e re-serializar o objeto muda os bytes e quebra
  // a verificação. Cada adapter faz o próprio parse.
  // Recebe a connection porque o segredo é de cada lojista, e Headers
  // inteiro porque cada gateway assina num header diferente.
  handleWebhook(
    rawBody: string,
    headers: Headers,
    connection: PaymentConnection,
    url: URL
  ): Promise<WebhookResult | null>;
}

// Corpo de webhook vem de fora: JSON inválido é 'nada a fazer', não crash.
export function safeParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
