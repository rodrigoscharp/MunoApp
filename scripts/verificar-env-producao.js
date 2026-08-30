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
 * **ASAAS_ENV é o interruptor, não um item da lista.** Ela é a declaração de
 * que a plataforma passou a cobrar de verdade: `baseUrl()` só aponta para o
 * host de produção do Asaas quando ela vale "production". Enquanto não estiver
 * ligada, produção está assumidamente em sandbox, e exigir credencial de
 * produção ali travaria o deploy de qualquer correção sem relação nenhuma com
 * assinatura — uma guarda que atrapalha mais do que protege.
 *
 * Ligada, aí sim as duas viram obrigatórias:
 *
 *   ASAAS_API_KEY       sem ela o Asaas recusa tudo — ninguém consegue pagar.
 *   ASAAS_WEBHOOK_TOKEN ausente, o handler responde 401 a toda entrega. O
 *                       cliente paga de verdade e nunca é provisionado, e o
 *                       Asaas interrompe a fila após 15 falhas.
 *
 * As duas quebram o funil pago em silêncio, cada uma de um jeito, e o momento
 * em que passam a ser exigidas é exatamente o momento em que começam a
 * importar. CRON_SECRET fica de fora de propósito: sem ele a rota de cobrança
 * responde 401 e nada acontece — falha fechada, sem cliente lesado, e é outro
 * interruptor, de quando se quer começar a cobrar a mensalidade.
 */

const OBRIGATORIAS = ["ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN"];

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
  // O interruptor. Sem ele ligado não há cobrança real para proteger.
  if (env.ASAAS_ENV !== "production") return [];
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

  // Três desfechos, e o log precisa distinguir os dois "passou" — senão um
  // build de produção com o Asaas ainda em sandbox anunciaria "credenciais
  // presentes", que é falso e esconde justamente o estado que se quer ver.
  const ambiente = process.env.VERCEL_ENV;
  if (ambiente !== "production") {
    const onde = ambiente ? `ambiente "${ambiente}"` : "build fora da Vercel";
    console.log(`[env] ${onde}: pulando. Só o deploy de produção confere.`);
  } else if (process.env.ASAAS_ENV !== "production") {
    console.log(
      "[env] deploy de produção com o Asaas ainda em sandbox: pulando.\n" +
        "      Ligue ASAAS_ENV=production quando for cobrar de verdade — a partir\n" +
        "      daí a chave e o token do webhook passam a ser obrigatórios."
    );
  } else {
    console.log("[env] deploy de produção cobrando de verdade: credenciais do Asaas presentes.");
  }
}
