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

// Dois limitadores, não um, os dois por tenant e IP.
//
// O 409 de e-mail já cadastrado é o que uma enumeração lê: alguém testando
// e-mails para descobrir quem já é cliente do restaurante. Contar cadastro
// bem-sucedido no mesmo balde do 409 refusava o sexto cliente real — operadora
// de celular brasileira põe muita gente atrás de poucos IPs públicos (CGNAT),
// e uma promoção de restaurante esbarra nisso na primeira hora. Por isso a
// enumeração tem o limite apertado (5) e o cadastro em si tem um geral, mais
// largo (20, o mesmo do forgot-password), só para conter bot.
const limitadorGeral = criarLimitador({ max: 20, janelaMs: 10 * 60 * 1000 });
const limitadorDeEmailExistente = criarLimitador({ max: 5, janelaMs: 10 * 60 * 1000 });

export async function POST(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  const ip = (req.headers.get("x-forwarded-for") ?? "desconhecido").split(",")[0].trim();
  const chave = `${tenantId}:${ip}`;
  const muitasTentativas = NextResponse.json(
    { error: "Muitas tentativas. Tente de novo em alguns minutos." },
    { status: 429 }
  );

  if (!limitadorGeral.permitir(chave, Date.now())) {
    return muitasTentativas;
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
      // Consumido só aqui, não em todo POST: é o 409 que devolve a existência
      // do e-mail, e é ele que uma enumeração está testando. Estourado o
      // limite, a resposta vira o mesmo 429 genérico, para não confirmar nem
      // negar o e-mail a quem já passou de 5 tentativas.
      if (!limitadorDeEmailExistente.permitir(chave, Date.now())) {
        return muitasTentativas;
      }
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
