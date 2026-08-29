import { NextRequest, NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { criarLimitador } from "@/lib/rate-limit";
import { checarSlug } from "@/lib/inscricao/slug";

/**
 * Confere se um endereço <slug>.munoapp.com.br está livre, antes de o cliente
 * pagar. Rota pública, sem autenticação, e sem tenant: usa prismaUnscoped
 * pelo mesmo motivo de /api/leads/publico — a checagem de slug não pertence a
 * restaurante nenhum, é da plataforma.
 *
 * Consultada a cada tecla digitada no checkout, então o teto do limitador é
 * mais alto que o de lead — mas é teto.
 */
const limitador = criarLimitador({ max: 60, janelaMs: 60 * 1000 });

export async function GET(req: NextRequest) {
  // A Vercel sobrescreve X-Forwarded-For na borda em vez de acrescentar a
  // ele, então o primeiro valor é sempre o IP público do cliente, nunca algo
  // que o requisitante escreveu — ver a explicação completa em
  // src/app/api/leads/publico/route.ts. Deixaria de valer atrás de um proxy
  // que faz append (nginx, outro CDN).
  const ip = (req.headers.get("x-forwarded-for") ?? "desconhecido")
    .split(",")[0]
    .trim();
  if (!limitador.permitir(ip, Date.now())) {
    return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 });
  }

  const slug = (req.nextUrl.searchParams.get("slug") ?? "").trim().toLowerCase();

  const resultado = await checarSlug(slug, {
    tenant: async (s) =>
      (await prismaUnscoped.tenant.findUnique({ where: { slug: s }, select: { id: true } })) !== null,
    inscricao: async (s) =>
      (await prismaUnscoped.inscricao.findUnique({ where: { slug: s }, select: { id: true } })) !== null,
  });

  return NextResponse.json(resultado);
}
