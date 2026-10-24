import { NextResponse, type NextRequest } from "next/server";
import { authPlatform } from "@/lib/auth-platform";
import { darBaixa } from "@/lib/assinatura/baixa";
import { invalidarCacheDeCobranca } from "@/lib/cache-de-cobranca";

/**
 * Baixa manual de uma cobrança, feita pelo operador da plataforma.
 *
 * Console da plataforma: sem tenant no contexto, tudo por prismaUnscoped (o
 * `darBaixa` cuida disso). A rota só autentica, traduz o resultado em HTTP e
 * sai da frente — a regra de negócio, que é o recálculo pela régua, mora em
 * src/lib/assinatura/baixa.ts.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await authPlatform();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const resultado = await darBaixa(id, new Date());

  if (!resultado.ok) {
    return resultado.motivo === "NAO_ENCONTRADA"
      ? NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
      : NextResponse.json(
          { error: "Esta cobrança está cancelada." },
          { status: 409 }
        );
  }

  // A faixa do /adm e o menu do console guardam a cobrança em cache. Sem isto,
  // o dono que acabou de pagar via "BLOQUEIO" por mais cinco minutos.
  invalidarCacheDeCobranca();

  return NextResponse.json({
    cobranca: resultado.cobranca,
    assinatura: resultado.assinatura,
  });
}
