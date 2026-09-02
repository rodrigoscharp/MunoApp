"use client";

/**
 * O bilhete que o login deixa para o convite de instalação.
 *
 * O LoginForm não pode mostrar o convite: ele redireciona no mesmo instante em
 * que a senha é aceita, e a folha sairia da tela antes de ser lida. Então ele
 * marca, e quem mostra é o ConviteDeInstalacao, já montado no layout do
 * cardápio, na tela seguinte.
 *
 * sessionStorage, e não localStorage, é a escolha que faz o convite acontecer
 * UMA vez por login. Em localStorage o bilhete sobreviveria à aba fechada e
 * reapareceria dias depois, sem nenhum login para justificá-lo.
 */

const CHAVE = "muno-pwa-convite-pendente";

export function pedirConviteAposLogin(): void {
  try {
    sessionStorage.setItem(CHAVE, "1");
  } catch {
    // Navegação privada bloqueia. Perde-se o convite pós-login; a faixa do
    // cardápio continua de pé, e entrar na conta é o que importa aqui.
  }
}

/** Lê e apaga: o bilhete vale uma exibição só. */
export function consumirConvitePendente(): boolean {
  try {
    if (sessionStorage.getItem(CHAVE) !== "1") return false;
    sessionStorage.removeItem(CHAVE);
    return true;
  } catch {
    return false;
  }
}

/*
 * Quem está com a palavra.
 *
 * A folha pós-login e a faixa do cardápio ficam montadas na mesma tela, e a
 * folha só aparece logo depois do login: sem coordenação, quem acabou de
 * entrar vê a Muno pedir a mesma instalação duas vezes de uma vez só, uma no
 * rodapé e outra no meio do cardápio. Pedir duas vezes é o que transforma um
 * convite em propaganda, que é justamente o que o resto deste módulo evita.
 *
 * A folha tem prioridade porque ela é a que tem o momento: alguém acabou de
 * entrar na conta. A faixa é permanente e volta assim que a folha sair.
 */

const AVISO_FOLHA = "muno:folha-de-instalacao";

let folhaVisivel = false;

export function anunciarFolha(visivel: boolean): void {
  folhaVisivel = visivel;
  window.dispatchEvent(new Event(AVISO_FOLHA));
}

export function folhaEstaVisivel(): boolean {
  return folhaVisivel;
}

export function aoMudarAFolha(ouvinte: () => void): () => void {
  window.addEventListener(AVISO_FOLHA, ouvinte);
  return () => window.removeEventListener(AVISO_FOLHA, ouvinte);
}
