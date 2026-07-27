import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { prismaUnscoped } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { listPaymentProviders, getPaymentProvider } from "@/lib/payments/factory";
import { encryptCredentials, decryptCredentials, maskCredentials } from "@/lib/payments/credentials";
import { extractErrorMessage } from "@/lib/error-message";
import { z } from "zod";

// Tela /adm/pagamentos (Task 6) é a única consumidora — exige ADMIN do
// próprio tenant em todos os métodos, mesmo padrão da extinta rota
// /api/payments/connect (recuperada de `git show 35a940e^`).
async function requireAdmin(): Promise<Session | null> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return session;
}

const bodySchema = z.object({
  provider: z.string(),
  credentials: z.record(z.string(), z.string()),
});

function webhookUrlFor(providerId: string, tenantId: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/webhook/${providerId}/${tenantId}`;
}

// Monta a resposta pública: uma entrada por provider cadastrado, com a
// conexão do tenant (se houver) sempre com credenciais mascaradas. Reusada
// pelos três handlers pra GET/POST/DELETE devolverem exatamente o mesmo
// shape — a UI sempre pode substituir o estado inteiro pela resposta.
async function buildProvidersPayload(tenantId: string) {
  const providers = listPaymentProviders();
  const connections = await prismaUnscoped.paymentConnection.findMany({ where: { tenantId } });

  return {
    providers: providers.map((provider) => {
      const connection = connections.find((c) => c.provider === provider.meta.id) ?? null;

      return {
        meta: provider.meta,
        connection: connection
          ? {
              status: connection.status,
              externalAccountId: connection.externalAccountId,
              lastCheckedAt: connection.lastCheckedAt,
              // Nenhuma resposta pode conter credencial em claro, nem para o
              // ADMIN dono do tenant.
              credentials: maskCredentials(
                decryptCredentials(connection.credentials),
                provider.meta.credentialFields
              ),
              webhookUrl: webhookUrlFor(provider.meta.id, tenantId),
            }
          : null,
      };
    }),
  };
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  return NextResponse.json(await buildProvidersPayload(session.user.tenantId));
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const tenantId = session.user.tenantId;

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { provider: providerId, credentials } = parsed.data;

  let provider;
  try {
    provider = getPaymentProvider(providerId);
  } catch (err) {
    return NextResponse.json({ error: extractErrorMessage(err) }, { status: 400 });
  }

  // Credencial que não passa no teste do gateway NUNCA entra no banco.
  const check = await provider.validateCredentials(credentials);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 422 });
  }

  // Só vira 'active' quando o webhook secret estiver presente — sem ele não
  // conseguiríamos confirmar pagamento nenhum.
  const status = credentials.webhookSecret ? "active" : "pending_webhook";

  await prismaUnscoped.$transaction([
    // Um gateway ativo por tenant: ativar um desativa os outros.
    prismaUnscoped.paymentConnection.updateMany({
      where: { tenantId, provider: { not: providerId } },
      data: { status: "disabled" },
    }),
    prismaUnscoped.paymentConnection.upsert({
      where: { tenantId_provider: { tenantId, provider: providerId } },
      update: {
        credentials: encryptCredentials(credentials),
        externalAccountId: check.externalAccountId ?? null,
        status,
        // Trocar credencial invalida a prova do webhook: o secret pode ter
        // mudado junto. Volta a null até chegar notificação assinada.
        lastCheckedAt: null,
      },
      create: {
        tenantId,
        provider: providerId,
        credentials: encryptCredentials(credentials),
        externalAccountId: check.externalAccountId ?? null,
        status,
      },
    }),
  ]);

  return NextResponse.json(await buildProvidersPayload(tenantId));
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const tenantId = session.user.tenantId;
  const providerId = req.nextUrl.searchParams.get("provider");
  if (!providerId) {
    return NextResponse.json({ error: "Parâmetro provider é obrigatório" }, { status: 400 });
  }

  try {
    getPaymentProvider(providerId);
  } catch (err) {
    return NextResponse.json({ error: extractErrorMessage(err) }, { status: 400 });
  }

  // Desconectar é o mesmo estado de "perdeu a disputa" pra ativação de outro
  // gateway: 'disabled'. Mantém o registro (credenciais, histórico) em vez
  // de apagar, caso o lojista reconecte depois.
  await prismaUnscoped.paymentConnection.updateMany({
    where: { tenantId, provider: providerId },
    data: { status: "disabled" },
  });

  return NextResponse.json(await buildProvidersPayload(tenantId));
}
