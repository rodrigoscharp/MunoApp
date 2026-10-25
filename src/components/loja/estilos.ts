/**
 * As classes da loja que se repetem em toda tela. Não há biblioteca de
 * componentes no projeto, e estas peças são classes, não componentes, de
 * propósito: um `<button>` e um `<Link>` com a mesma aparência continuam sendo
 * o elemento certo, sem um wrapper que esconda qual dos dois é.
 */

/** Botão principal: o tom mais fundo do terracota, por contraste com o branco. */
export const botaoBrasa =
  "inline-flex items-center justify-center gap-2 rounded-full bg-loja-brasa px-6 font-bold text-white shadow-loja-brasa transition hover:bg-loja-brasa-escura active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none";

/** Botão escuro, para a ação secundária que ainda importa (chat, cupom). */
export const botaoFloresta =
  "inline-flex items-center justify-center gap-2 rounded-full bg-forest-dark px-6 font-bold text-white transition hover:bg-forest active:scale-[0.98] disabled:opacity-50";

/** Botão de contorno. */
export const botaoContorno =
  "inline-flex items-center justify-center gap-2 rounded-full border-[1.5px] border-brand bg-transparent px-6 font-bold text-loja-preco transition hover:bg-loja-pessego-claro disabled:opacity-50";

/** Superfície de papel: card, linha de item, bloco de formulário. */
export const cartao = "rounded-[20px] bg-loja-papel shadow-loja";

/** Campo de formulário. */
export const campo =
  "w-full rounded-2xl border border-loja-linha bg-loja-papel px-4 py-3 text-[15px] text-loja-tinta placeholder:text-loja-tinta-2/70 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";

/** Rótulo pequeno em caixa alta, acima de manchete ou seção. */
export const kicker = "text-[10.5px] font-extrabold uppercase tracking-[0.16em]";
