import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { criarLimitador } from "@/lib/rate-limit";
import {
  JANELA_DEDUPE_MS,
  ORIGEM_LANDING,
  decidirGravacao,
  telefoneValido,
} from "@/lib/lead-landing";

/**
 * Captura de lead da landing de vendas, que mora em outro repositório e em
 * outro domínio.
 *
 * Esta rota sai do pipeline de tenant por uma guarda em src/proxy.ts, então
 * chega aqui SEM x-tenant-id — daí o prismaUnscoped explícito. Lead é dado da
 * plataforma, não de restaurante.
 */

// Módulo-escopo de propósito: o estado precisa sobreviver entre requisições da
// mesma instância. Ver a nota sobre o alcance disso em src/lib/rate-limit.ts.
const limitador = criarLimitador({ max: 5, janelaMs: 10 * 60 * 1000 });

const schema = z.object({
  restaurante: z.string().trim().min(2).max(120),
  telefone: z.string().trim().max(20).refine(telefoneValido, {
    message: "Telefone inválido",
  }),
  // String livre e não enum: os dois repositórios são publicados
  // separadamente, e um enum transformaria a próxima mudança no select da
  // landing em 400 silencioso — perdendo justamente o lead que esta rota
  // existe para não perder.
  plano: z.string().trim().max(60).optional(),
  website: z.string().max(200).optional(),
});

function origemPermitida(origem: string | null): boolean {
  if (!origem) return false;
  if (process.env.LANDING_ORIGIN && origem === process.env.LANDING_ORIGIN) {
    return true;
  }
  // Em desenvolvimento, a landing roda de um servidor local. Restrito a fora
  // de produção para que uma página em localhost não vire origem confiável no
  // ambiente real.
  if (process.env.NODE_ENV === "production") return false;
  try {
    const { hostname } = new URL(origem);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function cabecalhosCors(origem: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origem,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    // Sem Vary, um cache intermediário serviria a uma origem a resposta
    // liberada para outra.
    Vary: "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  const origem = req.headers.get("origin");
  if (!origemPermitida(origem)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, {
    status: 204,
    headers: cabecalhosCors(origem as string),
  });
}

export async function POST(req: NextRequest) {
  const origem = req.headers.get("origin");
  if (!origemPermitida(origem)) {
    return NextResponse.json({ error: "Origem não permitida" }, { status: 403 });
  }
  const cors = cabecalhosCors(origem as string);

  const ip = (req.headers.get("x-forwarded-for") ?? "desconhecido")
    .split(",")[0]
    .trim();
  if (!limitador.permitir(ip, Date.now())) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente de novo em alguns minutos." },
      { status: 429, headers: cors }
    );
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400, headers: cors });
  }

  const parsed = schema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues },
      { status: 400, headers: cors }
    );
  }

  const { restaurante, telefone, plano, website } = parsed.data;

  // Honeypot: campo escondido que humano não vê e bot preenche. A resposta é
  // 201 sem gravar — um 400 ensinaria ao bot qual campo é a armadilha.
  if (website && website.trim() !== "") {
    return NextResponse.json({ ok: true }, { status: 201, headers: cors });
  }

  const agora = new Date();
  const candidatos = await prismaUnscoped.lead.findMany({
    where: {
      origem: ORIGEM_LANDING,
      createdAt: { gte: new Date(agora.getTime() - JANELA_DEDUPE_MS) },
    },
    select: { id: true, telefone: true, origem: true, createdAt: true },
  });

  const decisao = decidirGravacao(candidatos, telefone, agora);

  if (decisao.acao === "atualizar") {
    // status fica de fora de propósito: reenvio não desfaz o lead que você já
    // moveu no funil.
    await prismaUnscoped.lead.update({
      where: { id: decisao.id },
      data: { restaurante, plano: plano ?? null },
    });
  } else {
    await prismaUnscoped.lead.create({
      data: { restaurante, telefone, plano: plano ?? null, origem: ORIGEM_LANDING },
    });
  }

  return NextResponse.json({ ok: true }, { status: 201, headers: cors });
}
