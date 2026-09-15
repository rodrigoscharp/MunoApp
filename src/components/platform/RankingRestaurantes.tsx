import { formatCurrency } from "@/lib/utils";

export type RestauranteDoRanking = {
  id: string;
  nome: string;
  pedidos: number;
  volume: number;
};

/**
 * Quem mais vende nos últimos 30 dias.
 *
 * A barra é relativa ao primeiro, e não ao total: a pergunta aqui é "quão
 * longe o segundo está do líder", e barra de participação no total ficaria
 * minúscula para todos assim que a base crescer.
 */
export function RankingRestaurantes({
  itens,
}: {
  itens: RestauranteDoRanking[];
}) {
  if (itens.length === 0) {
    return (
      <p className="text-[14px] text-console-mudo py-10 text-center">
        Nenhum pedido nos últimos 30 dias.
      </p>
    );
  }

  const lider = Math.max(1, itens[0].pedidos);

  return (
    <ol className="space-y-5">
      {itens.map((r, i) => (
        <li key={r.id} className="flex items-center gap-3.5">
          <span className="size-10 rounded-full bg-console-suave flex items-center justify-center text-[14px] font-semibold text-console-segunda shrink-0">
            {r.nome.trim().charAt(0).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[15px] font-medium truncate">{r.nome}</p>
              <p className="tabular text-[15px] font-semibold shrink-0">
                {r.pedidos}
              </p>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-console-tinta/[0.06] overflow-hidden">
              <div
                className="console-faixa h-full rounded-full bg-console-grafico"
                style={
                  {
                    width: `${Math.max(3, (r.pedidos / lider) * 100)}%`,
                    "--atraso": `${250 + i * 80}ms`,
                  } as React.CSSProperties
                }
              />
            </div>
            <p className="text-[12px] text-console-mudo mt-1.5 tabular">
              {formatCurrency(r.volume)} em pedidos
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
