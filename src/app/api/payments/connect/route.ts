import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPaymentProvider } from "@/lib/payments/factory";

// GET /api/payments/connect — inicia o fluxo de conexão da conta Mercado
// Pago do tenant logado (redireciona pro authorization_url do MP).
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  try {
    const url = await getPaymentProvider().getOnboardingUrl(session.user.tenantId);
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("[payments/connect] Erro ao gerar link de conexão:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao gerar link de conexão" },
      { status: 500 }
    );
  }
}
