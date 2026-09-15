import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { criarLimitador } from "@/lib/rate-limit";

const registerSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

// Por tenant e IP. O 409 de e-mail já cadastrado responde a quem perguntar, e
// sem limite a lista de clientes de um restaurante sai por tentativa. O tenant
// entra na chave para que o volume num restaurante não trave o cadastro em
// outro atrás do mesmo IP.
const limitador = criarLimitador({ max: 5, janelaMs: 10 * 60 * 1000 });

export async function POST(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  const ip = (req.headers.get("x-forwarded-for") ?? "desconhecido").split(",")[0].trim();
  if (!limitador.permitir(`${tenantId}:${ip}`, Date.now())) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente de novo em alguns minutos." },
      { status: 429 }
    );
  }

  return withTenant(tenantId, async () => {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Email já cadastrado" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { tenantId, name, email, password: hashedPassword },
      select: { id: true, name: true, email: true, role: true },
    });

    return NextResponse.json(user, { status: 201 });
  });
}
