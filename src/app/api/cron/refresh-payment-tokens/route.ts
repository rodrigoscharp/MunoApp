import { NextRequest, NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { getPaymentProvider } from "@/lib/payments/factory";
import { buildTenantBaseUrl } from "@/lib/tenant-url";
import { resend } from "@/lib/resend";

// Renova o access_token de conexões que vencem nos próximos 15 dias.
// Rodagem diária via Vercel Cron (ver vercel.json) — protegida por
// CRON_SECRET pra não poder ser disparada por qualquer um.
const RENEWAL_WINDOW_DAYS = 15;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const threshold = new Date(Date.now() + RENEWAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const connections = await prismaUnscoped.paymentConnection.findMany({
    where: { status: "active", expiresAt: { lte: threshold } },
  });

  let refreshed = 0;
  let failed = 0;

  for (const connection of connections) {
    try {
      const provider = getPaymentProvider(connection.provider);
      const updated = await provider.refreshToken(connection);

      if (updated.status === "needs_reauth") {
        failed++;
        await notifyTenantNeedsReauth(connection.tenantId);
      } else {
        refreshed++;
      }
    } catch (err) {
      failed++;
      console.error(`[cron/refresh-payment-tokens] Erro ao renovar conexão ${connection.id}:`, err);
    }
  }

  return NextResponse.json({ checked: connections.length, refreshed, failed });
}

async function notifyTenantNeedsReauth(tenantId: string): Promise<void> {
  const [tenant, admins] = await Promise.all([
    prismaUnscoped.tenant.findUnique({ where: { id: tenantId }, select: { nome: true, slug: true } }),
    prismaUnscoped.user.findMany({
      where: { tenantId, role: "ADMIN" },
      select: { email: true, name: true },
    }),
  ]);

  if (admins.length === 0) return;

  if (!process.env.RESEND_API_KEY) {
    console.error("[cron/refresh-payment-tokens] RESEND_API_KEY não configurada — notificação não enviada.");
    return;
  }

  const restaurantName = tenant?.nome ?? "seu restaurante";
  const reconnectUrl = `${buildTenantBaseUrl(tenant?.slug ?? "default")}/adm/restaurante`;

  await Promise.all(
    admins.map((admin) =>
      resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
        to: admin.email,
        subject: `Ação necessária: reconecte sua conta Mercado Pago — ${restaurantName}`,
        html: buildReauthEmailHtml(admin.name ?? "", restaurantName, reconnectUrl),
      })
    )
  );
}

function buildReauthEmailHtml(adminName: string, restaurantName: string, reconnectUrl: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#c2410c;padding:24px 32px;">
              <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;">⚠️ Conexão com o Mercado Pago expirou</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:15px;color:#111827;">Olá${adminName ? `, ${adminName}` : ""}!</p>
              <p style="margin:0 0 20px;font-size:14px;color:#4b5563;line-height:1.6;">
                Não conseguimos renovar automaticamente a conexão da conta Mercado Pago do
                <strong>${restaurantName}</strong>. Enquanto isso não for resolvido, os pagamentos
                dos pedidos não vão ser recebidos na sua conta.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:10px;background:#c2410c;">
                    <a href="${reconnectUrl}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
                      Reconectar conta →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
