import type { PaymentConnection, PaymentMethod } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import { MercadoPagoAdapter } from "./mercadopago-adapter";
import type { PaymentProvider } from "./types";

const adapters: Record<string, PaymentProvider> = {
  mercado_pago: new MercadoPagoAdapter(),
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
  const connection = await getActiveConnection(tenantId);
  if (!connection) return ["CASH"];

  return [...getPaymentProvider(connection.provider).meta.methods, "CASH"];
}
