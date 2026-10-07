/**
 * Único ponto por onde um erro que importa sai do processo.
 *
 * Hoje a produção não tem Sentry nem alarme: webhook que falha, cron que morre
 * e provisionamento que quebra viram uma linha em `console.error` no painel da
 * Vercel, e ninguém é avisado. Aqui o erro vira uma linha JSON estável (fácil
 * de filtrar no painel e de enviar a um dreno de logs), um EventoSistema que a
 * tela de saúde do console mostra, e, se `ERROR_WEBHOOK_URL` estiver definida,
 * uma mensagem para um canal (Slack, Discord, ou qualquer endpoint que aceite
 * `{ "text": "..." }`).
 *
 * Trocar por Sentry depois é mudar só este arquivo.
 *
 * Duas regras: nunca lança (reportar erro não pode virar outro erro no meio de
 * um pagamento) e nunca leva corpo, cabeçalho nem querystring, que carregam
 * token e dado pessoal.
 */

const JANELA_MS = 60_000;
const ultimoEnvio = new Map<string, number>();

export type ErroReportado = {
  /** De onde veio: "cron/assinaturas", "webhook/pagamento"... */
  origem: string;
  erro?: unknown;
  /** Só identificadores (ids). Nada de e-mail, telefone ou corpo de request. */
  extra?: Record<string, string | number | boolean | null | undefined>;
};

function mensagemDe(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  // Erros de SDK (Resend, por exemplo) vêm como objeto simples com `message`.
  if (typeof erro === "object" && erro !== null && "message" in erro) {
    return String((erro as { message: unknown }).message);
  }
  return erro === undefined ? "" : String(erro);
}

/** Substitui o que parece e-mail, para a mensagem do erro não vazar PII. */
export function semEmail(texto: string): string {
  return texto.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]");
}

/**
 * Grava o erro em EventoSistema, para a tela de saúde do console.
 *
 * Import dinâmico, e só fora do edge: onRequestError (src/instrumentation.ts)
 * também pode rodar no runtime edge, onde o Prisma não carrega. Um import
 * estático levaria o Prisma para esse bundle.
 *
 * Não reporta a própria falha: registrarSaude já engole e loga, e reportar
 * daqui chamaria esta função de novo.
 */
async function gravarEventoDeSaude(
  origem: string,
  mensagem: string,
  extra: ErroReportado["extra"]
): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") return;
  try {
    const { registrarSaude } = await import("@/lib/saude/registrar");
    await registrarSaude({
      origem,
      nivel: "ERRO",
      mensagem: mensagem || origem,
      tenantId: typeof extra?.tenantId === "string" ? extra.tenantId : null,
      extra,
    });
  } catch {
    // gravar evento nunca pode causar erro
  }
}

export async function reportarErro({ origem, erro, extra }: ErroReportado): Promise<void> {
  try {
    const mensagem = semEmail(mensagemDe(erro)).slice(0, 500);
    const digest =
      typeof erro === "object" && erro !== null && "digest" in erro
        ? String((erro as { digest: unknown }).digest)
        : undefined;

    console.error(JSON.stringify({ nivel: "erro", origem, mensagem, digest, ...extra }));

    // Antes do limite de envio: o canal recebe uma mensagem por minuto, mas a
    // tela de saúde conta todas.
    await gravarEventoDeSaude(origem, mensagem, extra);

    const url = process.env.ERROR_WEBHOOK_URL;
    if (!url) return;

    // Um cron com 100 falhas iguais não pode mandar 100 mensagens.
    const agora = Date.now();
    const chave = `${origem}:${mensagem}`;
    const anterior = ultimoEnvio.get(chave);
    if (anterior !== undefined && agora - anterior < JANELA_MS) return;
    ultimoEnvio.set(chave, agora);
    if (ultimoEnvio.size > 200) ultimoEnvio.clear();

    const detalhe = extra ? ` ${JSON.stringify(extra)}` : "";
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `[Muno] ${origem}: ${mensagem}${detalhe}` }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // reportar erro nunca pode causar erro
  }
}

/** Para os testes: esquece o que já foi enviado. */
export function _limparLimiteDeEnvio() {
  ultimoEnvio.clear();
}
