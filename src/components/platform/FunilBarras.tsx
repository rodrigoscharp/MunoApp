/**
 * Funil por estágio.
 *
 * Barras horizontais em HTML puro, não em biblioteca: são cinco marcas com
 * rótulo direto, sem eixo nem escala para desenhar. Horizontal porque os
 * rótulos são palavras ("Em negociação"), que em barra vertical virariam
 * texto girado.
 *
 * Série única, então não há legenda: o rótulo de cada linha carrega a
 * identidade, e o número no fim é a codificação secundária que torna a leitura
 * independente de cor.
 */

const ESTAGIOS = [
  { chave: "NOVO", rotulo: "Novo" },
  { chave: "CONTATADO", rotulo: "Contatado" },
  { chave: "NEGOCIACAO", rotulo: "Em negociação" },
  { chave: "FECHADO", rotulo: "Fechado" },
  { chave: "PERDIDO", rotulo: "Perdido" },
] as const;

export function FunilBarras({
  contagens,
}: {
  contagens: Record<string, number>;
}) {
  const maior = Math.max(1, ...ESTAGIOS.map((e) => contagens[e.chave] ?? 0));

  return (
    <ul className="space-y-[18px]">
      {ESTAGIOS.map(({ chave, rotulo }, i) => {
        const n = contagens[chave] ?? 0;
        // Verde para o que está em jogo; cinza para o desfecho negativo. Cor
        // nova para o perdido seria lida como mais uma categoria de lead.
        const perdido = chave === "PERDIDO";

        return (
          <li key={chave}>
            <div className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className="font-medium text-console-segunda">{rotulo}</span>
              <span
                className={`tabular font-semibold ${
                  n === 0 ? "text-console-mudo" : "text-console-tinta"
                }`}
              >
                {n}
              </span>
            </div>
            {/* Trilho recessivo: com zero leads os estágios seguem visíveis,
                o que é honesto. O funil existe, está vazio. */}
            <div className="mt-2 h-2.5 rounded-full bg-console-tinta/[0.06] overflow-hidden">
              {n > 0 && (
                <div
                  className={`console-faixa h-full rounded-full ${
                    perdido ? "bg-console-mudo" : "bg-console-grafico"
                  }`}
                  style={
                    {
                      width: `${Math.max(4, (n / maior) * 100)}%`,
                      "--atraso": `${250 + i * 90}ms`,
                    } as React.CSSProperties
                  }
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
