import { revalidateTag } from "next/cache";

/**
 * As tags dos caches que leem cobrança e lead, e o único jeito de limpá-los.
 *
 * A faixa de atraso do /adm guarda o vencimento por cinco minutos e os badges
 * do console por um. Sem invalidação, o dono que acabou de pagar continuava
 * vendo "BLOQUEIO" na faixa enquanto o proxy já tinha devolvido o acesso, e o
 * operador que movia um lead via o número do menu atrasado.
 *
 * As tags são globais, e não por restaurante, de propósito: pagamento e
 * mudança de lead acontecem poucas vezes por dia na plataforma inteira, e
 * jogar fora o cache de todos custa uma consulta por restaurante na próxima
 * visita. Tag por tenant exigiria saber o tenant em cada ponto que escreve
 * cobrança, e o cron escreve de vários de uma vez.
 */
export const TAG_AVISO_DE_COBRANCA = "adm:aviso-de-cobranca";
export const TAG_MENU_DO_CONSOLE = "console:menu";

/**
 * Nunca lança. Quem chama já gravou o que importava (a baixa, o lead), e um
 * cache que não limpou é uma faixa velha por alguns minutos, não motivo para
 * responder 500. Fora de uma requisição do Next (script, teste) o
 * revalidateTag lança, e lá não há cache para limpar.
 */
function limpar(tag: string): void {
  try {
    revalidateTag(tag, { expire: 0 });
  } catch {
    // sem contexto de requisição: nada a limpar
  }
}

/** Depois de qualquer escrita em Cobranca: baixa, espelho do Asaas, cron. */
export function invalidarCacheDeCobranca(): void {
  limpar(TAG_AVISO_DE_COBRANCA);
  // O menu do console conta as atrasadas.
  limpar(TAG_MENU_DO_CONSOLE);
}

/** Depois de criar ou mover um lead pelo console. */
export function invalidarMenuDoConsole(): void {
  limpar(TAG_MENU_DO_CONSOLE);
}
