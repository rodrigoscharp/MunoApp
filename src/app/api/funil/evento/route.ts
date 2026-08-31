import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { criarLimitador } from "@/lib/rate-limit";
import { COOKIE_SESSAO, sessaoValida } from "@/lib/funil/cookie";
import { registrarEvento } from "@/lib/funil/registrar";

/**
 * Ingestão dos eventos do funil disparados pelo navegador.
 *
 * Sai do pipeline de tenant por uma guarda em src/proxy.ts, então chega aqui
 * SEM x-tenant-id — daí o prismaUnscoped explícito, como em
 * /api/leads/publico. Funil é dado da plataforma, não de restaurante.
 *
 * Responde 204 em quase tudo, inclusive quando não grava. Quem chama é um
 * fetch com keepalive que descarta a resposta de propósito: devolver corpo
 * seria trabalho para ninguém ler.
 */

// Módulo-escopo de propósito: o estado precisa sobreviver entre requisições da
// mesma instância. Ver a nota sobre o alcance disso em src/lib/rate-limit.ts.
//
// Teto bem mais alto que o de lead (5 em 10 min): uma sessão legítima emite
// vários eventos numa visita só, e uma casa com wi-fi compartilhado emite
// vários por pessoa.
const limitador = criarLimitador({ max: 60, janelaMs: 10 * 60 * 1000 });

const schema = z.object({
  tipo: z.enum([
    "VISITA",
    "VIU_PRECO",
    "CLICOU_ASSINAR",
    "ABRIU_WHATSAPP",
    "CHECKOUT_PASSO",
  ]),
  detalhe: z.string().trim().optional(),
  utm: z
    .object({
      source: z.string().trim().max(80).optional(),
      medium: z.string().trim().max(80).optional(),
      campaign: z.string().trim().max(120).optional(),
    })
    .optional(),
  referrer: z.string().trim().max(120).optional(),
  dispositivo: z.enum(["celular", "desktop"]).optional(),
});

// Os tipos de servidor (CHECKOUT_CRIADO, PAGOU, PROVISIONADO, ABANDONOU) ficam
// FORA do enum acima de propósito: eles nascem de fatos que o servidor conhece,
// e aceitá-los aqui deixaria qualquer um declarar que pagou.

const MAX_DETALHE = 60;

function origensPermitidas(): string[] {
  return (process.env.LANDING_ORIGIN ?? "")
    .split(",")
    .map((entrada) => entrada.trim())
    .filter((entrada) => entrada !== "");
}

function origemPermitida(origem: string | null): origem is string {
  if (!origem) return false;
  // Comparação exata por item, nunca prefixo: "munoapp.com.br.attacker.com"
  // começa com uma origem permitida.
  if (origensPermitidas().includes(origem)) return true;
  if (process.env.NODE_ENV === "production") return false;
  try {
    const { hostname } = new URL(origem);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

const semConteudo = () => new NextResponse(null, { status: 204 });

export async function POST(req: NextRequest) {
  if (!origemPermitida(req.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida" }, { status: 403 });
  }

  // A Vercel sobrescreve X-Forwarded-For na borda em vez de acrescentar a ele,
  // então o primeiro valor é o IP público do cliente (mesmo raciocínio de
  // /api/leads/publico).
  const ip = (req.headers.get("x-forwarded-for") ?? "desconhecido")
    .split(",")[0]
    .trim();
  if (!limitador.permitir(ip, Date.now())) {
    // Atrás de CGNAT móvel brasileiro — o tráfego que a spec nomeia como o
    // que mais importa medir — uns 20 visitantes por IP bastam para bater
    // aqui, e o 204 devolvido não deixa rastro nenhum do lado do cliente.
    // Sem este log, o teto vira viés silencioso contra exatamente o
    // segmento que a instrumentação existe para medir.
    console.error(`[funil/evento] descartado — teto estourado pelo IP ${ip}`);
    return semConteudo();
  }

  const sessaoId = req.cookies.get(COOKIE_SESSAO)?.value;
  // Sem sessão não há o que costurar, e criar uma a partir do corpo deixaria
  // a tabela aberta para qualquer um inventar id. 204 porque o navegador que
  // bloqueia cookie não fez nada de errado: ele some do numerador e do
  // denominador ao mesmo tempo. Formato inválido segue o mesmo caminho: o
  // cookie é controlado pelo cliente e vira chave primária de SessaoFunil sem
  // passar por lugar nenhum — mesmo desfecho de quem não manda cookie algum.
  if (!sessaoValida(sessaoId)) return semConteudo();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { tipo, detalhe, utm, referrer, dispositivo } = parsed.data;

  try {
    // Atribuição de primeiro toque: o `update` é vazio de propósito. A sessão
    // guarda o utm que a criou, e quem chega pelo anúncio, sai e volta
    // digitando o endereço continua creditado ao anúncio, que foi quem pagou
    // pela visita.
    await prismaUnscoped.sessaoFunil.upsert({
      where: { id: sessaoId },
      create: {
        id: sessaoId,
        utmSource: utm?.source ?? null,
        utmMedium: utm?.medium ?? null,
        utmCampaign: utm?.campaign ?? null,
        referrer: referrer ?? null,
        dispositivo: dispositivo ?? null,
      },
      update: {},
    });

    // Trunca em vez de recusar: detalhe é enfeite do evento, e perder o evento
    // inteiro porque a etiqueta ficou comprida seria trocar o dado pelo rótulo.
    await registrarEvento(prismaUnscoped, {
      sessaoId,
      tipo,
      detalhe: detalhe ? detalhe.slice(0, MAX_DETALHE) : null,
    });
  } catch (erro) {
    console.error("[funil/evento] falha ao gravar", erro);
    return semConteudo();
  }

  return semConteudo();
}
