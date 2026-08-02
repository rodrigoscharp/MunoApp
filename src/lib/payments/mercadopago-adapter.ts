import crypto from "node:crypto";
import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

function configFor(connection: PaymentConnection): MercadoPagoConfig {
  const { accessToken } = decryptCredentials(connection.credentials);
  if (!accessToken) throw new Error("Conexão do Mercado Pago sem access token.");
  return new MercadoPagoConfig({ accessToken });
}

// A URL do webhook carrega o tenant porque, sem aplicação de plataforma, o
// segredo de assinatura é de cada lojista — precisamos saber de quem é a
// notificação antes de conseguir validá-la.
function notificationUrl(connection: PaymentConnection): string {
  return `${APP_URL}/api/payments/webhook/mercado_pago/${connection.tenantId}`;
}

function mapPaymentStatus(status: string | undefined): WebhookResult["status"] {
  switch (status) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
    case "refunded":
    case "charged_back":
      return "refunded";
    case "pending":
    case "in_process":
      return "pending";
    default:
      return "unknown";
  }
}

function isValidSignature(secret: string, headers: Headers, dataId: string): boolean {
  const signature = headers.get("x-signature");
  const requestId = headers.get("x-request-id");
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

  const manifest = `id:${dataId};request-id:${requestId ?? ""};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  // timingSafeEqual lança RangeError com buffers de tamanhos diferentes
  // (ex.: v1 forjado curto) — tratamos como assinatura inválida.
  const expectedBuf = Buffer.from(expected);
  const hashBuf = Buffer.from(hash);
  if (expectedBuf.length !== hashBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, hashBuf);
}

export class MercadoPagoAdapter implements PaymentProvider {
  meta: PaymentProviderMeta = {
    id: "mercado_pago",
    label: "Mercado Pago",
    docsUrl: "https://www.mercadopago.com.br/developers/panel/app",
    methods: ["PIX", "CREDIT_CARD"],
    // O MP identifica o pagador pelo e-mail, não precisa de CPF.
    requiresPayerDocument: false,
    brandColor: "#00B1EA",
    recommended: true,
    setupSteps: [
      {
        title: "Crie uma aplicação no Mercado Pago",
        body: "No painel de desenvolvedor, crie uma aplicação do tipo Pagamentos online. É ela que gera as credenciais da sua conta.",
        link: { label: "Abrir painel do Mercado Pago", url: "https://www.mercadopago.com.br/developers/panel/app" },
      },
      {
        title: "Copie o access token de produção",
        body: "Dentro da aplicação, vá em Credenciais de produção e copie o Access Token. Cole no campo abaixo e salve.",
        fills: ["accessToken"],
      },
      {
        title: "Cadastre a URL de notificação",
        body: "Ainda na aplicação, abra Webhooks, cole a URL abaixo e marque o evento Pagamentos.",
        showsWebhookUrl: true,
      },
      {
        title: "Cole a chave secreta do webhook",
        body: "Ao salvar o webhook, o Mercado Pago mostra uma chave secreta. Cole aqui para que a gente consiga confirmar seus pagamentos.",
        fills: ["webhookSecret"],
      },
    ],
    credentialFields: [
      {
        key: "accessToken",
        label: "Access token de produção",
        help: "No painel do Mercado Pago: Suas integrações → sua aplicação → Credenciais de produção.",
        type: "secret",
        required: true,
      },
      {
        key: "webhookSecret",
        label: "Chave secreta do webhook",
        help: "Gerada ao cadastrar a URL de notificação na sua aplicação, em Webhooks.",
        type: "secret",
        required: false,
      },
    ],
  };

  async validateCredentials(credentials: Record<string, string>): Promise<CredentialCheck> {
    const accessToken = credentials.accessToken;
    if (!accessToken) return { ok: false, reason: "Informe o access token." };

    try {
      const res = await fetch("https://api.mercadopago.com/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return { ok: false, reason: "O Mercado Pago recusou esse access token." };

      const user = (await res.json()) as { id?: number | string };
      return { ok: true, externalAccountId: user.id ? String(user.id) : undefined };
    } catch {
      return { ok: false, reason: "Não foi possível falar com o Mercado Pago agora." };
    }
  }

  async createCharge(order: ChargeableOrder, connection: PaymentConnection): Promise<Charge> {
    const mp = configFor(connection);

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
          notification_url: notificationUrl(connection),
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
    //
    // Uma linha só com o total, como no adapter da Stripe. A preference não tem
    // campo de valor: o MP cobra a SOMA dos items. Mandar o cardápio item a item
    // cobrava só o subtotal — a taxa de entrega ficava de fora, e com cupom o
    // desconto também sumiria, cobrando o cliente por um valor que não é o do
    // pedido. order.total já vem com frete somado e desconto abatido.
    const preferenceApi = new Preference(mp);
    const preference = await preferenceApi.create({
      body: {
        items: [
          {
            id: order.id,
            title: `Pedido MUNO #${order.id.slice(-6).toUpperCase()}`,
            quantity: 1,
            unit_price: order.total,
            currency_id: "BRL",
          },
        ],
        payer: { name: order.customerName },
        external_reference: order.id,
        notification_url: notificationUrl(connection),
        back_urls: {
          success: `${APP_URL}/track/${order.id}?payment=success`,
          failure: `${APP_URL}/track/${order.id}?payment=failure`,
          pending: `${APP_URL}/track/${order.id}?payment=pending`,
        },
        auto_return: "approved",
      },
    });

    return {
      provider: "mercado_pago",
      status: "pending",
      paymentId: String(preference.id),
      checkoutUrl: preference.init_point ?? undefined,
    };
  }

  async handleWebhook(
    rawBody: string,
    headers: Headers,
    connection: PaymentConnection
  ): Promise<WebhookResult | null> {
    // O MP assina um manifesto com o id do recurso, não o corpo — então
    // aqui o parse é só pra ler o payload.
    const body = safeParse(rawBody) as { type?: string; data?: { id?: string } } | null;
    if (body?.type !== "payment" || !body?.data?.id) return null;

    const { accessToken, webhookSecret } = decryptCredentials(connection.credentials);

    // Sem segredo configurado, NÃO processa. O tenantId da URL é público e
    // não autentica nada — aceitar aqui deixaria qualquer um marcar pedido
    // como pago.
    if (!webhookSecret) {
      console.error(
        `[mercadopago] Tenant ${connection.tenantId} recebeu webhook sem webhookSecret configurado — recusando.`
      );
      throw new InvalidWebhookSignatureError();
    }

    if (!isValidSignature(webhookSecret, headers, body.data.id)) {
      console.error("[mercadopago] Assinatura do webhook inválida — rejeitando notificação.");
      throw new InvalidWebhookSignatureError();
    }

    // Agora consultamos com o token do próprio lojista: o pagamento é da
    // conta dele, não existe mais token de plataforma.
    const paymentApi = new Payment(new MercadoPagoConfig({ accessToken }));
    const payment = await paymentApi.get({ id: body.data.id });

    const orderId = payment.external_reference;
    if (!orderId) return null;

    return {
      orderId,
      providerPaymentId: String(payment.id),
      status: mapPaymentStatus(payment.status),
    };
  }
}
