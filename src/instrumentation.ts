import type { Instrumentation } from "next";
import { reportarErro } from "@/lib/observabilidade";

/**
 * O que o React lança quando o cliente vai embora no meio da renderização. O
 * Next só filtra AbortError e ResponseAborted; estas duas chegam aqui como
 * Error comum. Comparação exata, e não "contém": uma mensagem nossa que cite a
 * frase continua sendo erro nosso.
 */
const MENSAGENS_DE_CLIENTE_QUE_SAIU = new Set([
  "The destination stream closed early.",
  "The destination stream errored while writing data.",
]);

function clienteSaiu(erro: unknown): boolean {
  if (!(erro instanceof Error)) return false;
  return (
    erro.name === "AbortError" ||
    erro.name === "ResponseAborted" ||
    MENSAGENS_DE_CLIENTE_QUE_SAIU.has(erro.message)
  );
}

/**
 * Todo erro não tratado de rota, página ou server action passa por aqui. Antes
 * ia só para o log da Vercel, sem aviso a ninguém.
 *
 * Cliente que fecha a aba no meio da renderização não é erro nosso, e não é
 * reportado: contado como erro de rota, cada cardápio fechado cedo empurraria
 * a peça "Erros de rota" da tela de saúde para o vermelho.
 *
 * Não leva cabeçalhos, querystring nem o caminho real do request (cookie de
 * sessão, tokens de reset e webhooks viajam neles, e o caminho de
 * /mesa/[token] carrega o token da mesa): só o método. A rota já vai na
 * origem, como padrão.
 */
export const onRequestError: Instrumentation.onRequestError = async (erro, request, context) => {
  if (clienteSaiu(erro)) return;
  await reportarErro({
    origem: `${context.routeType}:${context.routePath}`,
    erro,
    extra: { metodo: request.method },
  });
};
