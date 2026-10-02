import { NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";

/**
 * Para o monitor externo (UptimeRobot, Better Stack...): 200 se o app responde
 * e o banco atende uma consulta, 503 se não. Sem corpo informativo: é público,
 * e o motivo da falha não é da conta de quem pergunta.
 */
export async function GET() {
  try {
    await prismaUnscoped.$queryRaw`select 1`;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
