import type { Instrumentation } from "next";
import { reportarErro } from "@/lib/observabilidade";

/**
 * Todo erro não tratado de rota, página ou server action passa por aqui. Antes
 * ia só para o log da Vercel, sem aviso a ninguém.
 *
 * Não leva cabeçalhos nem querystring do request (cookie de sessão, tokens de
 * reset e webhooks viajam neles): só método e caminho sem a query.
 */
export const onRequestError: Instrumentation.onRequestError = async (erro, request, context) => {
  await reportarErro({
    origem: `${context.routeType}:${context.routePath}`,
    erro,
    extra: { metodo: request.method, caminho: request.path.split("?")[0] },
  });
};
