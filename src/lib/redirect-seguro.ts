// Origem que nenhum endereço real tem (.invalid é reservado pela RFC 2606).
const ORIGEM_FICTICIA = "http://destino.invalid";

/**
 * Devolve `valor` só se ele for um destino dentro do próprio site. Qualquer
 * outra coisa vira `padrao`.
 *
 * A checagem resolve o valor com `new URL` e compara a origem, em vez de olhar
 * prefixo. É o ponto da função: `//golpe.example`, `/\golpe.example` e
 * `/<tab>/golpe.example` começam com "/" e mesmo assim saem do site, porque o
 * navegador os lê como endereço de outro host. Resolvendo pelo mesmo parser,
 * a função enxerga o que o navegador enxerga.
 */
export function destinoSeguro<P extends string | null>(
  valor: string | null | undefined,
  padrao: P
): string | P {
  if (!valor || !valor.startsWith("/")) return padrao;

  let url: URL;
  try {
    url = new URL(valor, ORIGEM_FICTICIA);
  } catch {
    return padrao;
  }
  if (url.origin !== ORIGEM_FICTICIA) return padrao;

  return `${url.pathname}${url.search}${url.hash}`;
}
