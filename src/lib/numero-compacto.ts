/**
 * Números para o tamanho grande do console.
 *
 * O Core mostra "128k" e não "128.312": em 60px, cada dígito a mais empurra o
 * sparkline para fora da coluna. O valor exato continua disponível no `title`
 * de quem chama.
 */

const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const umaCasa = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const centavos = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * "299,70" (só moeda abaixo de mil), "4.890", "12,3k", "128k", "1,2mi".
 *
 * Os centavos ficam abaixo de mil porque é onde eles mudam a leitura: um
 * ticket de R$ 45,90 mostrado como "46" parece arredondamento de preço.
 */
export function numeroCompacto(valor: number, moeda = false): string {
  const a = Math.abs(valor);
  if (moeda && a < 1000) return centavos.format(valor);
  // `|| 0` porque Math.round(-0.2) é -0, e o Intl escreve "-0".
  if (a < 10_000) return inteiro.format(Math.round(valor) || 0);
  if (a < 1_000_000) {
    return `${(a < 100_000 ? umaCasa : inteiro).format(valor / 1000)}k`;
  }
  return `${umaCasa.format(valor / 1_000_000)}mi`;
}

/** 0.368 vira "36,8%". O sinal fica com a seta, não com o texto. */
export function percentual(valor: number): string {
  return `${umaCasa.format(Math.abs(valor) * 100)}%`;
}

/**
 * O topo do eixo: o primeiro valor "redondo" acima do máximo.
 *
 * O eixo mostra o topo e a metade, então a metade também precisa ser redonda.
 * Para contagens pequenas isso significa topo par: com máximo 3, um topo 3
 * rotularia a metade como "1,5 pedido".
 */
export function escalaBonita(maximo: number): number {
  if (!(maximo > 0)) return 0;
  const potencia = 10 ** Math.floor(Math.log10(maximo));
  const r = maximo / potencia;
  const fatores =
    potencia >= 100
      ? [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
      : potencia >= 10
        ? [1, 2, 3, 4, 5, 6, 8, 10]
        : [2, 4, 6, 8, 10];
  const fator = fatores.find((f) => r <= f + 1e-9) ?? 10;
  return Math.round(fator * potencia * 1000) / 1000;
}
