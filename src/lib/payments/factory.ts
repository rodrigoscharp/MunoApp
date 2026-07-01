import type { PaymentConnection } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import { MercadoPagoAdapter } from "./mercadopago-adapter";
import type { PaymentProvider } from "./types";

const DEFAULT_PROVIDER = "mercado_pago";

const adapters: Record<string, PaymentProvider> = {
  mercado_pago: new MercadoPagoAdapter(),
};

export function getPaymentProvider(provider: string = DEFAULT_PROVIDER): PaymentProvider {
  const adapter = adapters[provider];
  if (!adapter) throw new Error(`Provider de pagamento desconhecido: ${provider}`);
  return adapter;
}

// Resolve o adapter certo pro tenant a partir de payment_connections.provider,
// junto com a connection (ou null se o tenant ainda não conectou nenhuma
// conta — o adapter decide o fallback nesse caso).
export async function getPaymentProviderForTenant(
  tenantId: string
): Promise<{ provider: PaymentProvider; connection: PaymentConnection | null }> {
  const connection = await prismaUnscoped.paymentConnection.findFirst({
    where: { tenantId, status: "active" },
  });

  return {
    provider: getPaymentProvider(connection?.provider ?? DEFAULT_PROVIDER),
    connection,
  };
}
