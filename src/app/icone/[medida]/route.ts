import { NextResponse, type NextRequest } from "next/server";
import { getRestaurantInfo } from "@/lib/restaurant";
import { origemDoLogo } from "@/lib/pwa/logo-do-tenant";
import { ehMedida, normalizarIcone } from "@/lib/pwa/normalizar-icone";

/**
 * O ícone de app do restaurante, gerado do logo que o dono cadastrou.
 *
 *     /icone/192.png  /icone/512.png  /icone/maskable.png  /icone/apple.png
 *
 * Quem decide se esta rota é usada é o manifest (src/lib/pwa/manifest.ts): ele
 * só aponta para cá quando o tenant TEM logo próprio. Sem logo, ele aponta
 * direto para os arquivos da Muno em /icons/, e esta rota nem é chamada. É por
 * isso que o tenant "default", cujo logoUrl é o padrão, continua com a marca da
 * plataforma.
 *
 * A extensão no fim do caminho não é decoração: é ela que faz o `isEstatico()`
 * do proxy deixar a requisição passar no domínio raiz, onde qualquer outro
 * caminho leva 404.
 *
 * ---------------------------------------------------------------------------
 * Falhar aqui é pior do que parece
 *
 * Nenhum erro sai desta rota como erro. Ícone que responde 404 ou 500 não
 * produz um ícone feio: ele faz o navegador parar de oferecer a instalação, em
 * silêncio. Então todo caminho ruim (logo fora da allowlist, rede caindo,
 * arquivo que não é imagem) termina no ícone da Muno.
 */

// Alinhado ao teto de src/app/api/upload/route.ts. Um logo maior que isso não
// passou por lá, então não é logo nosso.
const TETO_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 4000;

const FALLBACK: Record<string, string> = {
  "192.png": "/icons/icone-192.png",
  "512.png": "/icons/icone-512.png",
  "maskable.png": "/icons/icone-maskable-512.png",
  "apple.png": "/apple-icon.png",
};

function daMuno(req: NextRequest, medida: string) {
  return NextResponse.redirect(
    new URL(FALLBACK[medida] ?? "/icons/icone-512.png", req.nextUrl.origin),
    // 307, e não 301: o tenant pode cadastrar um logo amanhã, e um permanente
    // ficaria gravado no navegador de quem visitou hoje.
    307
  );
}

/**
 * Baixa com teto de bytes de verdade.
 *
 * Conferir só o content-length não protege: ele é declarado por quem responde
 * e pode mentir, ou faltar. O corpo é lido em pedaços e a leitura é abortada
 * quando passa do teto, para uma resposta gigante não derrubar a função.
 */
async function baixarComTeto(url: string, sinal: AbortSignal): Promise<Buffer> {
  const res = await fetch(url, { signal: sinal, redirect: "error" });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const declarado = Number(res.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > TETO_BYTES) {
    throw new Error("logo maior que o teto");
  }

  const pedacos: Uint8Array[] = [];
  let total = 0;
  for await (const pedaco of res.body as unknown as AsyncIterable<Uint8Array>) {
    total += pedaco.byteLength;
    if (total > TETO_BYTES) throw new Error("logo maior que o teto");
    pedacos.push(pedaco);
  }
  return Buffer.concat(pedacos);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ medida: string }> }
) {
  const { medida } = await params;
  if (!ehMedida(medida)) return new NextResponse(null, { status: 404 });

  // O proxy só injeta x-tenant-id em subdomínio de restaurante. No raiz e em
  // admin. não há logo de ninguém para usar.
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) return daMuno(req, medida);

  try {
    const { logoUrl } = await getRestaurantInfo(tenantId);
    const origem = origemDoLogo(logoUrl);
    if (!origem) return daMuno(req, medida);

    // Relativo resolve contra a NOSSA origem; remoto já passou pela allowlist
    // de logo-do-tenant.ts, que é o que impede este fetch de virar SSRF.
    const alvo =
      origem === "relativo" ? new URL(logoUrl, req.nextUrl.origin).toString() : logoUrl;

    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
    let bruto: Buffer;
    try {
      bruto = await baixarComTeto(alvo, controle.signal);
    } finally {
      clearTimeout(relogio);
    }

    const png = await normalizarIcone(bruto, medida);

    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        // Imutável porque o manifest carimba ?v=<hash do logoUrl>: logo novo é
        // URL nova, então cachear para sempre não prende ninguém ao logo
        // antigo. Sem esse carimbo, este cabeçalho seria uma armadilha.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    // Rede caiu, o arquivo sumiu do storage, o conteúdo não era imagem. Todos
    // terminam igual: o ícone da Muno, e a instalação segue oferecida.
    return daMuno(req, medida);
  }
}
