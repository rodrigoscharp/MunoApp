/**
 * Qual ícone desenhar para uma categoria do cardápio, a partir do nome que o
 * dono deu a ela.
 *
 * Categoria não tem campo de ícone, e pedir que o dono escolha um para cada
 * seção seria mais uma tela no cadastro. O nome já diz quase sempre do que se
 * trata: "Lanches", "Bebidas geladas", "Porções para dividir". A comparação é
 * sem acento e sem caixa, por trecho de palavra, e a ordem das regras importa:
 * "Combo de lanche" é combo antes de ser lanche.
 *
 * O que não casar com nada recebe o prato genérico, nunca um ícone errado.
 */
export type IconeDeCategoria =
  | "combo"
  | "lanche"
  | "pizza"
  | "porcao"
  | "bebida"
  | "doce"
  | "acai"
  | "salgado"
  | "prato"
  | "salada"
  | "japones"
  | "cafe"
  | "generico";

const REGRAS: [IconeDeCategoria, string[]][] = [
  ["combo", ["combo", "kit", "promo"]],
  ["acai", ["acai", "sorvete", "gelato"]],
  ["pizza", ["pizza", "esfiha", "esfirra"]],
  ["japones", ["japon", "sushi", "temaki", "poke", "oriental"]],
  ["lanche", ["lanche", "hamb", "burg", "smash", "sanduich", "x-", "hot dog", "cachorro"]],
  ["porcao", ["porc", "batata", "frita", "petisc", "aperitiv", "acompanh"]],
  ["salada", ["salada", "fit", "vegan", "veget"]],
  ["salgado", ["salgad", "pastel", "coxinha", "empada"]],
  ["cafe", ["cafe", "cafeteria", "padaria"]],
  ["bebida", ["bebida", "drink", "suco", "refri", "agua", "cerveja", "chopp", "vinho", "milk", "shake"]],
  ["doce", ["doce", "sobremesa", "bolo", "torta", "brownie", "brigadeiro", "chocolate"]],
  ["prato", ["prato", "marmit", "executiv", "almoco", "jantar", "massa", "risoto", "grelhad", "parmegian"]],
];

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function iconeDaCategoria(nome: string): IconeDeCategoria {
  const n = normalizar(nome);
  for (const [icone, trechos] of REGRAS) {
    if (trechos.some((t) => n.includes(t))) return icone;
  }
  return "generico";
}
