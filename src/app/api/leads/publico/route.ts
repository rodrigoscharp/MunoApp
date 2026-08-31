import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { criarLimitador } from "@/lib/rate-limit";
import { COOKIE_SESSAO } from "@/lib/funil/cookie";
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

// LANDING_ORIGIN aceita uma origem ou várias separadas por vírgula, no mesmo
// formato que ROOT_DOMAIN já usa em src/proxy.ts. A lista existe porque a
// landing responde em mais de um endereço enquanto o domínio raiz muda de
// projeto: com um valor só, uma das origens tomaria 403 e perderia lead em
// silêncio no meio da transição.
//
// O filtro de vazio não é decoração. Sem ele, "a,,b" produziria uma entrada ""
// que casaria com requisição sem Origin.
function origensPermitidas(): string[] {
  return (process.env.LANDING_ORIGIN ?? "")
    .split(",")
    .map((entrada) => entrada.trim())
    .filter((entrada) => entrada !== "");
}

function origemPermitida(origem: string | null): origem is string {
  if (!origem) return false;
  // Comparação exata por item, nunca prefixo: "munoapp.com.br.attacker.com"
  // começa com uma origem permitida, e um startsWith entregaria o endpoint a
  // quem registrasse esse nome.
  if (origensPermitidas().includes(origem)) {
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
    headers: cabecalhosCors(origem),
  });
}

export async function POST(req: NextRequest) {
  const origem = req.headers.get("origin");
  if (!origemPermitida(origem)) {
    // A landing joga fora a resposta deste POST de propósito, então ninguém do
    // lado do cliente percebe uma recusa. Sem este log, mudar LANDING_ORIGIN
    // para de gravar lead no CRM enquanto as conversas de WhatsApp seguem
    // normais — e a descoberta vira "por que não entra lead novo?", dias
    // depois.
    console.error(
      `[leads/publico] 403 — origem recusada: ${origem ?? "(sem Origin)"}`
    );
    return NextResponse.json({ error: "Origem não permitida" }, { status: 403 });
  }
  const cors = cabecalhosCors(origem);

  // Em geral o primeiro valor de X-Forwarded-For é o menos confiável — quem
  // ataca controla a própria requisição e pode escrever o que quiser antes do
  // IP real. Mas a Vercel sobrescreve este cabeçalho na borda, em vez de
  // acrescentar a ele: o que chega aqui é sempre o IP público do cliente,
  // nunca algo que o requisitante tenha inserido. Por isso confiar no
  // primeiro valor é seguro nesta plataforma — e deixaria de ser atrás de um
  // proxy que faz append (nginx, outro CDN), onde o primeiro valor volta a
  // ser escrita livre de quem chamou.
  const ip = (req.headers.get("x-forwarded-for") ?? "desconhecido")
    .split(",")[0]
    .trim();
  if (!limitador.permitir(ip, Date.now())) {
    console.error(`[leads/publico] 429 — teto estourado pelo IP ${ip}`);
    return NextResponse.json(
      { error: "Muitas tentativas. Tente de novo em alguns minutos." },
      { status: 429, headers: cors }
    );
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    console.error("[leads/publico] 400 — corpo não é JSON válido");
    return NextResponse.json({ error: "JSON inválido" }, { status: 400, headers: cors });
  }

  const parsed = schema.safeParse(corpo);
  if (!parsed.success) {
    // Mensagem genérica de propósito: devolver parsed.error.issues incluiria
    // o path do campo que falhou, e um "website" no path entregaria ao bot
    // qual campo é o honeypot — a mesma fuga de informação que o 201 do
    // honeypot existe para evitar.
    // O log traz os NOMES dos campos que falharam, nunca o que a pessoa
    // digitou: telefone é dado pessoal e não tem por que viver no log. Isso
    // basta para reconhecer o sintoma que importa — a landing publicada com
    // um campo renomeado derruba todos os leads com o mesmo path.
    console.error(
      `[leads/publico] 400 — campos recusados: ${parsed.error.issues
        .map((i) => i.path.join("."))
        .join(", ")}`
    );
    return NextResponse.json(
      { error: "Dados inválidos" },
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

  // Mesmo padrão de /api/assinar: a FK de Lead.sessaoId aponta para
  // SessaoFunil, e o VISITA que cria essa linha sai da mesma página, num fetch
  // concorrente a este. Sem garantir a linha antes, a captação de lead morre
  // por violação de FK numa corrida que ninguém veria.
  //
  // Falhar aqui degrada para lead sem origem, nunca para erro: a conversa de
  // WhatsApp já está acontecendo do outro lado.
  let sessaoId = req.cookies.get(COOKIE_SESSAO)?.value ?? null;
  if (sessaoId) {
    try {
      await prismaUnscoped.sessaoFunil.upsert({
        where: { id: sessaoId },
        create: { id: sessaoId },
        update: {},
      });
    } catch (erro) {
      console.error(
        "[leads/publico] não foi possível garantir a sessão do funil",
        erro
      );
      sessaoId = null;
    }
  }

  try {
    // Rota pública sem autenticação, e o limitador é por IP: um bot
    // distribuído rotacionando IP furou o teto e pode ter deixado muitas
    // linhas na janela de 24h. `origem`/`createdAt` não têm índice (só
    // `status` tem, em schema.prisma) — sem limite, essa consulta escala
    // com esse volume, e cada envio legítimo seguinte paga o full scan.
    // `decidirGravacao` só quer o candidato mais recente por telefone, então
    // ordenar por createdAt desc e truncar em 200 preserva exatamente os
    // candidatos capazes de vencer a decisão; o pior caso do corte é um lead
    // duplicado ocasional, o que é estritamente melhor que travar a rota.
    const candidatos = await prismaUnscoped.lead.findMany({
      where: {
        origem: ORIGEM_LANDING,
        createdAt: { gte: new Date(agora.getTime() - JANELA_DEDUPE_MS) },
      },
      select: { id: true, telefone: true, origem: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const decisao = decidirGravacao(candidatos, telefone, agora);

    if (decisao.acao === "atualizar") {
      // status fica de fora de propósito: reenvio não desfaz o lead que você
      // já moveu no funil. plano segue a mesma regra: um reenvio sem o campo
      // não pode apagar o plano que uma primeira submissão já tinha
      // capturado.
      await prismaUnscoped.lead.update({
        where: { id: decisao.id },
        data: { restaurante, ...(plano ? { plano } : {}) },
      });
    } else {
      await prismaUnscoped.lead.create({
        // "" normaliza para null, como o campo digitado à mão: string vazia
        // não é um plano, é ausência de resposta.
        data: {
          restaurante,
          telefone,
          plano: plano || null,
          origem: ORIGEM_LANDING,
          sessaoId,
        },
      });
    }
  } catch (erro) {
    // 500 com os mesmos cabeçalhos de CORS das outras respostas: sem eles, o
    // navegador da landing reporta isto como falha de CORS, e quem investiga
    // não consegue distinguir "o servidor quebrou" de "fui bloqueado". O
    // corpo fica genérico — o detalhe vai para o log do servidor, não para
    // quem chamou.
    console.error("Falha ao gravar lead da landing:", erro);
    return NextResponse.json(
      { error: "Erro ao processar o pedido" },
      { status: 500, headers: cors }
    );
  }

  return NextResponse.json({ ok: true }, { status: 201, headers: cors });
}
