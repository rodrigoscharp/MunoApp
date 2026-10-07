import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { avaliarSaude } from "@/lib/saude/avaliar";
import { coletarDadosDeSaude } from "@/lib/saude/coletar";

/**
 * Para o monitor externo (UptimeRobot, Better Stack): 503 quando alguma peça
 * da saúde está vermelha, 200 caso contrário. Amarelo não derruba: o monitor
 * acorda alguém, e amarelo é para quando a pessoa abrir a tela.
 *
 * Mora no host raiz, como /api/health, porque o admin. fecha por IP e por
 * sessão, e o monitor não tem nenhum dos dois. A porta é o
 * HEALTH_MONITOR_TOKEN, aceito no header ou na query: o plano grátis de alguns
 * monitores não manda header.
 *
 * O corpo diz só QUAIS peças estão vermelhas, para a mensagem do alarme dizer
 * o que caiu. O motivo fica na tela do console.
 */
const SEM_CACHE = { "Cache-Control": "no-store" };

function autorizado(req: NextRequest): boolean {
  // `!esperado` não é redundante: sem ele, uma variável não configurada
  // compararia com string vazia e abriria a rota para "Bearer ".
  const esperado = process.env.HEALTH_MONITOR_TOKEN;
  if (!esperado) return false;
  const cabecalho = req.headers.get("authorization");
  const recebido = cabecalho?.startsWith("Bearer ")
    ? cabecalho.slice("Bearer ".length)
    : req.nextUrl.searchParams.get("token");
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  // timingSafeEqual lança com tamanhos diferentes; o tamanho não é segredo.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: SEM_CACHE });
  }
  const agora = new Date();
  const saude = avaliarSaude(await coletarDadosDeSaude(agora), agora);
  const vermelhas = saude.pecas.filter((p) => p.cor === "vermelho").map((p) => p.chave);
  return NextResponse.json(
    { ok: vermelhas.length === 0, vermelhas },
    { status: vermelhas.length ? 503 : 200, headers: SEM_CACHE }
  );
}
