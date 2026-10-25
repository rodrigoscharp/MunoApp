/**
 * O link que o dono cola para os clientes avaliarem o restaurante no Google.
 *
 * Ele sai do Perfil da Empresa, no botão "Pedir avaliações", e tem duas formas
 * comuns: `https://g.page/r/<código>/review` e
 * `https://search.google.com/local/writereview?placeid=<id>`. O link curto do
 * Maps (`maps.app.goo.gl`) também abre a ficha.
 *
 * Só endereço do Google passa. O botão aparece para todo cliente que recebeu um
 * pedido, com a marca do Google desenhada nele: um link qualquer ali seria um
 * botão "Avalie no Google" levando para outro site, com a confiança do
 * cardápio emprestada a ele.
 */

const HOSTS_EXATOS = new Set(["g.page", "maps.app.goo.gl", "goo.gl"]);

function hostDoGoogle(host: string): boolean {
  if (HOSTS_EXATOS.has(host)) return true;
  // google.com, google.com.br e qualquer subdomínio deles (search., www.,
  // maps., business.). A âncora no fim é o que impede google.com.golpe.net.
  return /(^|\.)google\.com(\.br)?$/.test(host);
}

/** Valida e devolve o link pronto para gravar, ou null se não serve. */
export function normalizarLinkDeAvaliacao(valor: string): string | null {
  const texto = valor.trim();
  if (!texto) return null;
  // Quem copia do navegador às vezes leva só "g.page/r/...": o https entra aqui
  // em vez de virar erro para o dono.
  const comProtocolo = /^[a-z][a-z0-9+.-]*:/i.test(texto) ? texto : `https://${texto}`;
  let url: URL;
  try {
    url = new URL(comProtocolo);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!hostDoGoogle(url.hostname.toLowerCase())) return null;
  return url.toString();
}

export const MENSAGEM_LINK_INVALIDO =
  "Cole o link de avaliação do Google (g.page/r/... ou search.google.com/local/writereview...)";
