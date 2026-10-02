import { MENSAGEM_SENHA_MINIMA, SENHA_MINIMA } from "@/lib/senha";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { criarLimitador } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";

const schema = z.object({
  token: z.string(),
  password: z.string().min(SENHA_MINIMA, MENSAGEM_SENHA_MINIMA),
});

// O token em si (256 bits aleatórios, 1h de validade, uso único) já é a
// defesa real; isto só contém quem tentasse forçar tokens por tentativa e
// erro nesta rota.
const limitador = criarLimitador({ max: 20, janelaMs: 10 * 60 * 1000 });

export async function POST(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  const ip = (req.headers.get("x-forwarded-for") ?? "desconhecido")
    .split(",")[0]
    .trim();
  if (!limitador.permitir(ip, Date.now())) {
    return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 });
  }

  return withTenant(tenantId, async () => {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { token, password } = parsed.data;

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken) {
      return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 400 });
    }

    if (resetToken.expiresAt < new Date()) {
      await prisma.passwordResetToken.delete({ where: { token } });
      return NextResponse.json({ error: "Link expirado. Solicite um novo." }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Queimar o token e trocar a senha são um passo só. Lidos e gravados em
    // separado, dois pedidos simultâneos com o mesmo link passavam os dois; e
    // se a troca falhasse depois de o token ser apagado, o link morria sem a
    // senha mudar. Aqui o deleteMany é o que desempata (só um vê count 1), e
    // um erro na troca desfaz a exclusão.
    const trocou = await prisma.$transaction(async (tx) => {
      const queimado = await tx.passwordResetToken.deleteMany({ where: { token } });
      if (queimado.count !== 1) return false;

      await tx.user.update({
        where: { tenantId_email: { tenantId: resetToken.tenantId, email: resetToken.email } },
        data: { password: hashedPassword, passwordChangedAt: new Date() },
      });
      return true;
    });

    if (!trocou) {
      return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  });
}
