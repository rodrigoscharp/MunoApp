/**
 * A que peça do semáforo pertence um evento, pela origem.
 *
 * As origens seguem a convenção que reportarErro já usava ("area/detalhe",
 * "area/detalhe:subcaso"), mais as do onRequestError ("route:/api/...",
 * "render:/...", "action:/...", "proxy:/..."). Casa por prefixo, então um
 * reportarErro novo aparece no feed sem mudar nada aqui.
 *
 * A ORDEM IMPORTA. E-mail vem primeiro porque o provisionamento reporta a
 * falha de boas-vindas como "<quem chamou>:boas-vindas", e quem chamou pode
 * ser o webhook do Asaas. Se o webhook viesse antes, um e-mail que falhou
 * acenderia o webhook.
 */
export type ChavePeca =
  | "banco"
  | "cron"
  | "webhook-asaas"
  | "provisionamento"
  | "pagamentos"
  | "email"
  | "rotas"
  | "pedidos";

/** O sinal de vida do cron diário. As etapas usam "cron/assinaturas:<etapa>". */
export const ORIGEM_DO_CRON = "cron/assinaturas";
export const ORIGEM_DO_PROVISIONAMENTO = "provisionamento";

const ERRO_NAO_TRATADO = /^(render|route|action|proxy):/;

export function classificarOrigem(origem: string): ChavePeca | null {
  if (origem.endsWith(":boas-vindas") || origem.startsWith("forgot-password")) return "email";
  if (origem.startsWith("webhook/asaas") || origem.startsWith("route:/api/assinaturas/webhook")) {
    return "webhook-asaas";
  }
  if (origem.startsWith("webhook/pagamento") || origem.startsWith("route:/api/payments/webhook")) {
    return "pagamentos";
  }
  if (origem.startsWith("cron/") || origem.startsWith("route:/api/cron")) return "cron";
  if (ERRO_NAO_TRATADO.test(origem)) return "rotas";
  return null;
}
