/**
 * As classes do painel do restaurante (/adm e a cozinha). É a mesma
 * linguagem da loja (src/components/loja/estilos.ts) — creme, papel,
 * manchete condensada, terracota e floresta — com a densidade de quem lê
 * dado: cartões menores, tabela, selo de status.
 *
 * Os mockups aprovados estão em docs/design/painel-novo/.
 */

export {
  botaoBrasa,
  botaoFloresta,
  botaoContorno,
  campo,
  kicker,
} from "@/components/loja/estilos";

/** Superfície do painel: cartão de métrica, lista, formulário. */
export const cartaoPainel = "rounded-[22px] bg-loja-papel shadow-loja";

/** Título de seção dentro de um cartão. */
export const tituloDeSecao = "text-[15px] font-extrabold text-loja-tinta";

/** Rótulo pequeno de tabela ou de campo. */
export const rotulo = "text-[11.5px] font-bold text-loja-tinta-2";

/** Chip de filtro; o ativo é floresta. */
export const chip =
  "inline-flex h-[38px] items-center gap-2 rounded-full bg-loja-papel px-3.5 text-[13px] font-semibold text-loja-tinta transition hover:bg-white aria-pressed:bg-forest-dark aria-pressed:font-extrabold aria-pressed:text-white";

/** Linha de tabela do painel. */
export const linhaDeTabela = "border-t border-[#F0E6DA]";
