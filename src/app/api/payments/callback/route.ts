import { NextRequest, NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { getPaymentProvider } from "@/lib/payments/factory";
import { verifyOAuthState } from "@/lib/oauth-state";
import { buildTenantBaseUrl } from "@/lib/tenant-url";

// GET /api/payments/callback — o Mercado Pago redireciona pra cá depois do
// tenant autorizar o app. Não passa pelo subdomínio do tenant (redirect_uri
// é fixo/global), então o tenant só é conhecido através do `state` assinado.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const mpError = req.nextUrl.searchParams.get("error");

  if (mpError) {
    console.error("[payments/callback] Mercado Pago retornou erro:", mpError);
  }

  if (!state) {
    return NextResponse.json({ error: "State ausente" }, { status: 400 });
  }

  const verified = verifyOAuthState(state);
  if (!verified) {
    return NextResponse.json({ error: "State inválido ou expirado" }, { status: 400 });
  }

  const tenant = await prismaUnscoped.tenant.findUnique({
    where: { id: verified.tenantId },
    select: { slug: true },
  });
  const baseUrl = buildTenantBaseUrl(tenant?.slug ?? "default");

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/adm/restaurante?mp=error`);
  }

  try {
    await getPaymentProvider().exchangeAuthorizationCode(code, verified.tenantId);
    return NextResponse.redirect(`${baseUrl}/adm/restaurante?mp=success`);
  } catch (err) {
    console.error("[payments/callback] Falha ao trocar code por token:", err);
    return NextResponse.redirect(`${baseUrl}/adm/restaurante?mp=error`);
  }
}
