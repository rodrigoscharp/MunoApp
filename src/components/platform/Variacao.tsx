import { ArrowDown, ArrowUp } from "lucide-react";
import { percentual } from "@/lib/numero-compacto";

/**
 * A pílula "↑ 36,8%" do Core.
 *
 * Sem base de comparação ela diz isso, em cinza, em vez de sumir: um card com
 * pílula e outro sem faz parecer que o segundo esqueceu de carregar.
 */
export function Variacao({
  valor,
  compacta = false,
}: {
  valor: number | null;
  compacta?: boolean;
}) {
  const tamanho = compacta
    ? "px-1.5 py-[2px] text-[12px]"
    : "px-2 py-[3px] text-[13px] sm:text-[14px]";

  // Zero não sobe nem cai. Com a seta verde, "↑ 0%" afirma um movimento que
  // não houve, e é o tipo de número que alguém repete numa reunião.
  if (valor === 0) {
    return (
      <span
        className={`inline-flex items-center rounded-lg border border-console-linha font-semibold tabular text-console-segunda ${tamanho}`}
      >
        0%
      </span>
    );
  }

  if (valor === null) {
    return (
      <span
        className={`inline-flex items-center rounded-lg border border-console-linha font-medium text-console-mudo ${tamanho}`}
      >
        sem base
      </span>
    );
  }

  const sobe = valor >= 0;
  const Seta = sobe ? ArrowUp : ArrowDown;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg border font-semibold tabular ${tamanho} ${
        sobe
          ? "border-console-positivo/25 bg-console-positivo-fundo text-console-positivo"
          : "border-console-alerta/25 bg-console-negativo-fundo text-console-alerta"
      }`}
    >
      <Seta size={compacta ? 12 : 14} strokeWidth={2.5} aria-hidden />
      {percentual(valor)}
      <span className="sr-only">{sobe ? "de alta" : "de queda"}</span>
    </span>
  );
}
