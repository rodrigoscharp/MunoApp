import { NextResponse } from "next/server";
import { getRequestTenantId } from "@/lib/tenant-request";
import { getPaymentContext } from "@/lib/payments/factory";

// Rota PÚBLICA (sem auth): o checkout do cliente final consulta antes de
// oferecer PIX/cartão. Devolve só os métodos e se o gateway exige CPF do
// pagador — nada de status de conexão, id de conta ou nome de gateway, que
// não são assunto do cliente.
export async function GET() {
  const tenantId = await getRequestTenantId();
  return NextResponse.json(await getPaymentContext(tenantId));
}
