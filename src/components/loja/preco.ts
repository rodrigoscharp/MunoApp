import { formatCurrency } from "@/lib/utils";

/**
 * Preço para manchete e banner: "R$ 27" quando não há centavos, e o valor
 * inteiro quando há ("R$ 27,90"). Na sacola e no total vale sempre o
 * formatCurrency completo, porque ali o cliente confere conta.
 */
export function precoCurto(valor: number): string {
  const completo = formatCurrency(valor);
  return Number.isInteger(valor) ? completo.replace(/,00$/, "") : completo;
}
