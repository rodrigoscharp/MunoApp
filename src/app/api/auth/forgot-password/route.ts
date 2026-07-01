import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { resend } from "@/lib/resend";
import { getRestaurantInfo } from "@/lib/restaurant";
import { buildTenantBaseUrl } from "@/lib/tenant-url";
import { z } from "zod";
const schema = z.object({
  email: z.string().email(),
});

function buildEmailHtml({
  userName,
  restaurantName,
  restaurantAddress,
  restaurantPhone,
  logoUrl,
  resetUrl,
}: {
  userName: string;
  restaurantName: string;
  restaurantAddress: string;
  restaurantPhone: string;
  logoUrl: string | null;
  resetUrl: string;
}) {
  const logoBlock = logoUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
                      <tr>
                        <td style="background:#ffffff;border-radius:16px;padding:14px 24px;line-height:0;">
                          <img src="${logoUrl}" alt="${restaurantName}" width="140" height="48" style="display:block;width:140px;height:48px;border:0;" />
                        </td>
                      </tr>
                    </table>`
    : `<p style="margin:0 0 20px;font-size:26px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">${restaurantName}</p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Redefinição de senha</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;-webkit-font-smoothing:antialiased;">

  <!-- Preheader (hidden preview text) -->
  <div style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    Redefina sua senha do ${restaurantName} — o link expira em 1 hora.
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">

        <!-- Card container -->
        <table role="presentation" width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">

          <!-- ── HEADER ─────────────────────────────── -->
          <tr>
            <td style="background:linear-gradient(135deg,#c2410c 0%,#e85d04 50%,#f97316 100%);border-radius:16px 16px 0 0;padding:0;overflow:hidden;">

              <!-- Decorative top strip -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:36px 40px 32px;text-align:center;position:relative;">

                    <!-- Logo em container branco -->
                    ${logoBlock}

                    <!-- Divider -->
                    <div style="width:40px;height:2px;background:rgba(255,255,255,0.4);margin:0 auto 16px;border-radius:2px;"></div>

                    <!-- Badge -->
                    <div style="display:inline-block;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);border-radius:100px;padding:6px 16px;">
                      <span style="color:#ffffff;font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">🔐 Redefinição de Senha</span>
                    </div>

                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- ── BODY ──────────────────────────────── -->
          <tr>
            <td style="background:#ffffff;padding:40px 40px 32px;">

              <!-- Greeting -->
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px;">
                Olá, ${userName}! 👋
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.7;">
                Recebemos uma solicitação para redefinir a senha da sua conta no <strong style="color:#374151;">${restaurantName}</strong>. Clique no botão abaixo para criar uma nova senha.
              </p>

              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>
                  <td style="border-radius:12px;background:linear-gradient(135deg,#c2410c,#e85d04);box-shadow:0 4px 14px rgba(232,93,4,0.35);">
                    <a href="${resetUrl}"
                       style="display:inline-block;padding:16px 36px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.2px;border-radius:12px;">
                      Redefinir minha senha →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Link fallback -->
              <p style="margin:0 0 28px;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
                Ou copie e cole este link no seu navegador:<br/>
                <a href="${resetUrl}" style="color:#e85d04;word-break:break-all;font-size:11px;">${resetUrl}</a>
              </p>

              <!-- Info box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
                <tr>
                  <td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="24" style="vertical-align:top;padding-top:1px;">
                          <span style="font-size:16px;">⏱</span>
                        </td>
                        <td style="padding-left:10px;">
                          <p style="margin:0;font-size:13px;color:#9a3412;line-height:1.5;">
                            <strong>Este link expira em 1 hora.</strong> Se não conseguir acessar a tempo, solicite um novo link na página de login.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- ── SECURITY NOTE ──────────────────────── -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #f3f4f6;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="20" style="vertical-align:top;padding-top:1px;">
                    <span style="font-size:14px;">🔒</span>
                  </td>
                  <td style="padding-left:10px;">
                    <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                      Se você <strong style="color:#6b7280;">não solicitou</strong> a redefinição de senha, ignore este email com segurança. Sua senha permanece a mesma.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── FOOTER ─────────────────────────────── -->
          <tr>
            <td style="background:#111827;border-radius:0 0 16px 16px;padding:28px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align:center;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.08);">
                    <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#f9fafb;">${restaurantName}</p>
                    <p style="margin:0;font-size:12px;color:#6b7280;">${restaurantAddress}</p>
                    ${restaurantPhone ? `<p style="margin:4px 0 0;font-size:12px;color:#6b7280;">${restaurantPhone}</p>` : ""}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:16px;text-align:center;">
                    <p style="margin:0;font-size:11px;color:#4b5563;line-height:1.6;">
                      Este é um email automático, por favor não responda.<br/>
                      © ${new Date().getFullYear()} ${restaurantName}. Todos os direitos reservados.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- /Card container -->

      </td>
    </tr>
  </table>

</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    const { email } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
    });

    // Sempre retorna sucesso para não expor quais emails existem
    if (!user || !user.password) {
      return NextResponse.json({ ok: true });
    }

    // Invalida tokens anteriores do mesmo email
    await prisma.passwordResetToken.deleteMany({ where: { email } });

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hora

    const resetToken = await prisma.passwordResetToken.create({
      data: { tenantId, email, expiresAt },
    });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
    const baseUrl = buildTenantBaseUrl(tenant?.slug ?? "default");
    const resetUrl = `${baseUrl}/redefinir-senha?token=${resetToken.token}`;

    if (!process.env.RESEND_API_KEY) {
      console.error("[forgot-password] RESEND_API_KEY não configurada");
      return NextResponse.json({ error: "Serviço de email não configurado" }, { status: 503 });
    }

    const restaurantInfo = await getRestaurantInfo(tenantId);

    // Usa URL absoluta: se já for http (Supabase/CDN), usa direto; se for local, constrói com baseUrl
    const logoUrl = restaurantInfo.logoUrl.startsWith("http")
      ? restaurantInfo.logoUrl
      : `${baseUrl}${restaurantInfo.logoUrl}`;

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
      to: email,
      subject: `Redefina sua senha — ${restaurantInfo.name}`,
      html: buildEmailHtml({
        userName: user.name,
        restaurantName: restaurantInfo.name,
        restaurantAddress: restaurantInfo.address,
        restaurantPhone: restaurantInfo.phone,
        logoUrl,
        resetUrl,
      }),
    });

    return NextResponse.json({ ok: true });
  });
}
