import { Barlow_Condensed, Plus_Jakarta_Sans } from "next/font/google";

/**
 * As duas fontes da loja: Barlow Condensed nas manchetes (nome do restaurante,
 * banner, nome do prato, preço grande) e Plus Jakarta Sans no resto.
 *
 * Moram aqui, e não no layout raiz, porque o raiz serve também o console, o
 * painel e a cozinha, que não as usam: lá elas entrariam no preload de toda
 * página sem nunca pintar. Cada layout da loja aplica `fontesDaLoja` no próprio
 * invólucro, e o `next/font` só manda o preload para as rotas que importam este
 * módulo.
 */
const manchete = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
});

const corpo = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

/** As variáveis das duas fontes, para pôr no invólucro de um layout da loja. */
export const fontesDaLoja = `${manchete.variable} ${corpo.variable}`;
