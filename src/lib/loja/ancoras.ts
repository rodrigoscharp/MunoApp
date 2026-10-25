/**
 * Os ids de âncora da loja, num lugar só.
 *
 * O slug da categoria é texto livre do dono (`z.string().min(1)` na rota), e
 * a seção usava o slug cru como id. Uma categoria "Cardápio" ou "Mais
 * pedidos" virava `id="cardapio"` ou `id="mais-pedidos"`, os mesmos ids das
 * âncoras fixas, e o botão da barra de baixo ou o bloco "Top" levava para a
 * seção errada. Com o prefixo, nenhum slug produz uma âncora fixa: elas não
 * começam com "cat-".
 */

/** A âncora das categorias, usada por "Cardápio" na barra de baixo. */
export const ANCORA_DO_CARDAPIO = "cardapio";
/** A fileira de mais pedidos, usada pelo bloco "Top" da navegação. */
export const ANCORA_DOS_MAIS_PEDIDOS = "mais-pedidos";

const PREFIXO_DA_SECAO = "cat-";

/** O id da seção de uma categoria. */
export function idDaSecao(slug: string): string {
  return `${PREFIXO_DA_SECAO}${slug}`;
}

/**
 * Para link antigo com o slug cru (`/#lanches`, de antes do prefixo): o id da
 * seção, se o hash não for uma âncora que existe por si.
 */
export function secaoDoHashAntigo(hash: string): string | null {
  let alvo: string;
  try {
    alvo = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return null;
  }
  if (!alvo) return null;
  if (alvo === ANCORA_DO_CARDAPIO || alvo === ANCORA_DOS_MAIS_PEDIDOS) return null;
  return idDaSecao(alvo);
}
