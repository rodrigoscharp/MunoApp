import type { PaymentConnection, PaymentMethod } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import { MercadoPagoAdapter } from "./mercadopago-adapter";
import { AsaasAdapter } from "./asaas-adapter";
import { StripeAdapter } from "./stripe-adapter";
import { AbacatePayAdapter } from "./abacatepay-adapter";
import { PagBankAdapter } from "./pagbank-adapter";
import type { PaymentProvider } from "./types";

const adapters: Record<string, PaymentProvider> = {
  mercado_pago: new MercadoPagoAdapter(),
  asaas: new AsaasAdapter(),
  stripe: new StripeAdapter(),
  abacate_pay: new AbacatePayAdapter(),
  pagbank: new PagBankAdapter(),
};

export function listPaymentProviders(): PaymentProvider[] {
  return Object.values(adapters);
}

export function getPaymentProvider(id: string): PaymentProvider {
  const adapter = adapters[id];
  if (!adapter) throw new Error(`Provider de pagamento desconhecido: ${id}`);
  return adapter;
}

// Só conexões 'active' contam. 'pending_webhook' significa que o lojista
// ainda não configurou o segredo do webhook — sem isso não conseguiríamos
// confirmar o pagamento, então é melhor não oferecer pagamento online.
export async function getActiveConnection(tenantId: string): Promise<PaymentConnection | null> {
  return prismaUnscoped.paymentConnection.findFirst({
    where: { tenantId, status: "active" },
  });
}

export async function getEnabledPaymentMethods(tenantId: string): Promise<PaymentMethod[]> {
  return (await getPaymentContext(tenantId)).methods;
}

// O que o checkout precisa saber sobre o gateway do tenant: quais métodos
// oferecer e se o gateway exige CPF do pagador (o Asaas exige, o Mercado
// Pago não). Só isso — nada de status de conexão ou nome do gateway, que
// são informação do lojista, não do cliente final.
export async function getPaymentContext(
  tenantId: string
): Promise<{ methods: PaymentMethod[]; requiresPayerDocument: boolean }> {
  const connection = await getActiveConnection(tenantId);
  if (!connection) return { methods: ["CASH"], requiresPayerDocument: false };

  const { meta } = getPaymentProvider(connection.provider);
  return {
    methods: [...meta.methods, "CASH"],
    requiresPayerDocument: meta.requiresPayerDocument,
  };
}
