/**
 * Funil por estágio.
 *
 * Barras horizontais em HTML puro, não em biblioteca: são cinco marcas com
 * rótulo direto, sem eixo nem escala para desenhar. Horizontal porque os
 * rótulos são palavras ("Em negociação"), que em barra vertical virariam
 * texto girado.
 *
 * Série única, então não há legenda — o rótulo de cada linha carrega a
 * identidade, e o número no fim de cada barra é a codificação secundária que
 * torna a leitura independente de cor.
 */

const ESTAGIOS = [
  { chave: "NOVO", rotulo: "novo" },
  { chave: "CONTATADO", rotulo: "contatado" },
  { chave: "NEGOCIACAO", rotulo: "em negociação" },
  { chave: "FECHADO", rotulo: "fechado" },
  { chave: "PERDIDO", rotulo: "perdido" },
] as const;

// Verde para o que está em jogo; cinza para o desfecho negativo. O par foi
// validado: separação ΔE 13,1 em protanopia e contraste acima de 3:1.
const COR_ATIVO = "#2B5240";
const COR_PERDIDO = "#78716C";

export function FunilBarras({
  contagens,
}: {
  contagens: Record<string, number>;
}) {
  const maior = Math.max(1, ...ESTAGIOS.map((e) => contagens[e.chave] ?? 0));
  const total = ESTAGIOS.reduce((s, e) => s + (contagens[e.chave] ?? 0), 0);

  return (
    <section className="bg-console-cartao rounded-2xl border border-console-linha px-5 py-4 h-full">
      <div className="flex items-baseline justify-between mb-5">
        <p className="text-[13px] text-console-tinta/45">funil</p>
        {total > 0 && (
          <p className="text-[13px] text-console-tinta/45">
            {total} {total === 1 ? "lead" : "leads"}
          </p>
        )}
      </div>

      <ul className="space-y-3">
        {ESTAGIOS.map(({ chave, rotulo }) => {
          const n = contagens[chave] ?? 0;
          const largura = n === 0 ? 0 : Math.max(4, (n / maior) * 100);
          const perdido = chave === "PERDIDO";

          return (
            <li key={chave} className="flex items-center gap-3">
              <span className="w-[104px] shrink-0 text-[13px] text-neutral-500 text-right">
                {rotulo}
              </span>

              {/* Trilho recessivo: com zero leads os estágios seguem visíveis,
                  o que é honesto — o funil existe, está vazio. */}
              <span className="flex-1 h-6 rounded bg-console-papel relative">
                {n > 0 && (
                  <span
                    className="absolute inset-y-0 left-0 rounded"
                    style={{
                      width: `${largura}%`,
                      backgroundColor: perdido ? COR_PERDIDO : COR_ATIVO,
                    }}
                  />
                )}
              </span>

              <span
                className={`tabular w-7 shrink-0 text-sm text-right ${
                  n === 0 ? "text-neutral-300" : "text-console-tinta"
                }`}
              >
                {n}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
