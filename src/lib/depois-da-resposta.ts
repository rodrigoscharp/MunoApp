import { after } from "next/server";

/**
 * Agenda trabalho para depois de a resposta sair, pelo `after()` do Next.
 *
 * Existe para o aviso de tempo real: o pedido já está gravado quando o
 * broadcast roda, e esperar por ele (até 2s, o teto de broadcastTenantEvent)
 * era tempo que a cozinha e o cliente passavam olhando um botão girando. Na
 * Vercel o `after` estende a vida da função até a tarefa terminar, ao contrário
 * de uma promessa solta, que morre junto com a resposta.
 *
 * Fora de uma requisição o `after` lança. Isso só acontece em teste de unidade
 * e em script, onde não há resposta a esperar: a tarefa roda na hora, sem
 * segurar quem chamou. Rota de verdade sempre cai no primeiro ramo.
 */
export function depoisDaResposta(tarefa: () => Promise<unknown>): void {
  try {
    after(tarefa);
  } catch {
    // Promise.resolve: a tarefa de um mock pode nem devolver promessa, e um
    // erro aqui viraria 500 numa rota que já gravou o que tinha de gravar.
    try {
      void Promise.resolve(tarefa()).catch(() => {});
    } catch {
      // idem: tarefa que lança na hora não derruba quem chamou
    }
  }
}
