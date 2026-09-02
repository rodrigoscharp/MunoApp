/**
 * De onde o ícone do restaurante pode vir.
 *
 * Esta função existe por um motivo só, e ele é de segurança.
 *
 * `logoUrl` é `z.string()` em src/lib/restaurant.ts, sem nenhuma validação de
 * URL, e quem grava é o dono do restaurante pelo próprio admin. Enquanto o
 * valor só virava `src` de uma `<img>`, isso era inofensivo: quem busca é o
 * navegador de quem visita, com a rede de quem visita.
 *
 * A rota de ícone muda esse contrato. Ela busca a URL **do servidor**, o que
 * transformaria o campo num SSRF cujo atacante é um cliente pagante com ADMIN
 * legítimo: bastaria apontar o logo para um endereço interno e ler o que
 * voltasse. Por isso a busca é por allowlist, e não por lista de bloqueio.
 *
 * A lista é a mesma de `next.config.js` (`**.supabase.co`, `**.supabase.com`),
 * porque é para lá que src/app/api/upload/route.ts manda os arquivos.
 */

/** O que getRestaurantInfo devolve quando ninguém cadastrou logo (SEM_CADASTRO). */
export const LOGO_PADRAO = "/munowbg.png";

// Precisa do ponto na frente: "evil-supabase.co" não termina em
// ".supabase.co", e "abc.supabase.co.evil.com" termina em ".evil.com".
const HOSTS_PERMITIDOS = [".supabase.co", ".supabase.com"];

const EXTENSAO_DE_IMAGEM = /\.(png|jpe?g|webp|gif|avif)$/i;

export type OrigemDoLogo = "relativo" | "remoto";

/**
 * Classifica o `logoUrl` de um restaurante, ou devolve null quando ele não
 * pode virar ícone.
 *
 * null cobre três coisas diferentes de propósito, porque a resposta é a mesma
 * nas três: usar o ícone da Muno. É logo não cadastrado, é URL que a allowlist
 * recusa, e é caminho relativo que não aponta para uma imagem.
 */
export function origemDoLogo(logoUrl: string): OrigemDoLogo | null {
  const url = logoUrl?.trim();
  if (!url) return null;

  // Quem está com o padrão não cadastrou logo nenhum. Não é segurança, é
  // semântica: o ícone dele tem que ser o da Muno, e é isso que mantém o
  // tenant "default" com a marca da plataforma.
  if (url === LOGO_PADRAO) return null;

  if (url.startsWith("/")) {
    // "//evil.com/x.png" é protocolo-relativo: começa com barra e aponta para
    // fora. Uma checagem de startsWith("/") sozinha o deixaria passar como se
    // fosse caminho da nossa origem.
    if (url.startsWith("//")) return null;
    // Sem isto, logoUrl = "/api/orders" faria o servidor buscar a própria API
    // e jogar a resposta no sharp. Ele recusaria, mas a requisição já teria
    // acontecido, por conta do servidor.
    return EXTENSAO_DE_IMAGEM.test(url.split("?")[0]) ? "relativo" : null;
  }

  let alvo: URL;
  try {
    alvo = new URL(url);
  } catch {
    return null;
  }

  // Só HTTPS: sem TLS a resposta é interceptável, e um ícone não vale isso.
  if (alvo.protocol !== "https:") return null;
  // Credencial no host é o truque clássico para confundir parser ingênuo
  // ("https://abc.supabase.co@evil.com" tem hostname evil.com). O parser da
  // URL acerta, mas quem lê o código depois pode não acertar: recusar é mais
  // barato que explicar.
  if (alvo.username || alvo.password) return null;

  const host = alvo.hostname.toLowerCase();
  return HOSTS_PERMITIDOS.some((h) => host.endsWith(h)) ? "remoto" : null;
}
