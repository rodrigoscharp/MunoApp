#!/usr/bin/env node
/**
 * Derruba o build de produção quando falta credencial do Asaas — só no deploy
 * de produção.
 *
 * Existe pelo mesmo motivo de migrate-on-deploy.js, e é o par dele: aquele
 * impede publicar código esperando coluna que o banco não tem; este impede
 * publicar checkout que não consegue cobrar.
 *
 * O buraco que ele fecha: `asaas.ts` lê `process.env.ASAAS_API_KEY ?? ""` e
 * manda `access_token: ""` sem reclamar. Sem esta guarda, um deploy sem a
 * chave sobe verde, a landing pública ganha um "Começar Agora" funcionando, e
 * a falha só aparece no instante em que o visitante tenta pagar — o pior lugar
 * possível para descobrir uma variável de ambiente esquecida.
 *
 * Por que as três, e não só a chave:
 *
 *   ASAAS_API_KEY       sem ela o Asaas recusa tudo — ninguém consegue pagar.
 *   ASAAS_ENV           ausente, baseUrl() cai em sandbox (o padrão dele). A
 *                       cobrança "funciona", o cliente vê sucesso, e o dinheiro
 *                       nunca existiu.
 *   ASAAS_WEBHOOK_TOKEN ausente, o handler responde 401 a toda entrega. O
 *                       cliente paga de verdade e nunca é provisionado, e o
 *                       Asaas interrompe a fila após 15 falhas.
 *
 * As três quebram o funil pago em silêncio, cada uma de um jeito. CRON_SECRET
 * fica de fora de propósito: sem ele a rota de cobrança responde 401 e nada
 * acontece — falha fechada, sem cliente lesado, e é um interruptor que se liga
 * quando se quer começar a cobrar.
 */

const OBRIGATORIAS = ["ASAAS_API_KEY", "ASAAS_ENV", "ASAAS_WEBHOOK_TOKEN"];

/**
 * Recebe o ambiente por parâmetro em vez de ler process.env aqui dentro:
 * assim a regra é testável sem subprocesso e sem mexer no ambiente do
 * processo de teste.
 *
 * Fora do deploy de produção não exige nada. Preview e build local não têm as
 * chaves de produção e não devem ter — exigi-las aqui quebraria todo PR, do
 * mesmo jeito que migrar em preview mexeria no banco de produção.
 */
function faltantesEmProducao(env) {
  if (env.VERCEL_ENV !== "production") return [];
  // `.trim()` porque `vercel env add` com valor em branco grava "": a variável
  // existe para quem pergunta se existe, e não serve para nada.
  return OBRIGATORIAS.filter((nome) => (env[nome] ?? "").trim() === "");
}

module.exports = { faltantesEmProducao, OBRIGATORIAS };

if (require.main === module) {
  const faltando = faltantesEmProducao(process.env);

  if (faltando.length > 0) {
    console.error(
      `\n[env] Deploy de produção sem ${faltando.length === 1 ? "a variável" : "as variáveis"}: ${faltando.join(", ")}.\n` +
        "      O checkout iria ao ar sem conseguir cobrar, e a falha só\n" +
        "      apareceria na tela de pagamento do cliente.\n\n" +
        "      Configure em Vercel > Settings > Environment Variables\n" +
        "      (ambiente Production) e refaça o deploy.\n"
    );
    process.exit(1);
  }

  const ambiente = process.env.VERCEL_ENV;
  console.log(
    ambiente === "production"
      ? "[env] deploy de produção: credenciais do Asaas presentes."
      : `[env] ${ambiente ? `ambiente "${ambiente}"` : "build fora da Vercel"}: pulando. Só o deploy de produção exige as chaves.`
  );
}
