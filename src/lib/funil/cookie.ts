/**
 * O cookie da sessão anônima do funil.
 *
 * Sem atributo Domain, de propósito. Em `.munoapp.com.br` ele seria enviado em
 * toda requisição de todo cardápio de todo restaurante, engordando o header de
 * páginas que não têm nada a ver com o funil. Host-only, ele fica no apex, que
 * é onde a landing e o checkout vivem.
 *
 * HttpOnly porque o JavaScript nunca precisa ler o valor: a rota de ingestão é
 * same-origin e o navegador manda o cookie sozinho no fetch.
 */
export const COOKIE_SESSAO = "muno_s";

/** Um ano. Sessão curta transformaria visitante recorrente em vários. */
export const MAX_AGE_SESSAO = 60 * 60 * 24 * 365;
