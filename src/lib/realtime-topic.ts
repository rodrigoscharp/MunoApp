import crypto from "node:crypto";

/**
 * Nome secreto de um canal de Broadcast.
 *
 * Os canais do Supabase Realtime são abertos a quem tem a chave anon, que vai
 * no bundle de todo cardápio. Com o nome `tenant:<id>:<canal>`, quem soubesse o
 * tenantId (a sessão e a página de acompanhamento o entregam ao navegador)
 * escutava a fila de pedidos do restaurante e, com o orderId que ela revela, a
 * posição do motoboy; e podia publicar no mesmo canal.
 *
 * O sufixo HMAC torna o nome inadivinhável. Quem pode ouvir um canal o
 * descobre pelo endpoint /api/realtime/topic, que confere a permissão antes de
 * devolvê-lo. É uma credencial ao portador: vale até o segredo ser trocado.
 * Não é tão forte quanto canal privado com RLS em realtime.messages, mas
 * fecha o buraco sem depender de configuração no painel do Supabase.
 */
function segredo(): string {
  const explicito = process.env.REALTIME_TOPIC_SECRET;
  if (explicito) return explicito;

  // Sem variável nova para configurar no deploy: deriva de um segredo que já
  // existe e nunca chega ao navegador.
  const base = process.env.PAYMENT_TOKEN_ENCRYPTION_KEY;
  if (base) {
    return crypto.createHmac("sha256", base).update("realtime-topic").digest("hex");
  }

  // Em desenvolvimento e teste um valor fixo basta; em produção, um segredo
  // público seria pior que nenhum, então falha alto.
  if (process.env.NODE_ENV !== "production") return "segredo-so-de-desenvolvimento";
  throw new Error("REALTIME_TOPIC_SECRET (ou PAYMENT_TOKEN_ENCRYPTION_KEY) não configurada");
}

export function topicoSeguro(tenantId: string, canal: string): string {
  const selo = crypto
    .createHmac("sha256", segredo())
    .update(`${tenantId}|${canal}`)
    .digest("base64url")
    .slice(0, 22);
  return `tenant:${tenantId}:${canal}:${selo}`;
}
