import { kicker } from "@/components/loja/estilos";

/**
 * O topo de toda tela do painel: o rótulo pequeno em terracota (data, contagem,
 * contexto) e a manchete em caixa alta, com as ações à direita.
 */
export function CabecalhoDaTela({
  contexto,
  titulo,
  children,
}: {
  /** O rótulo de cima: "HOJE · 31 PEDIDOS", "4 CATEGORIAS · 14 ITENS". */
  contexto?: React.ReactNode;
  titulo: string;
  /** Busca, filtros de período, botão principal. */
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        {contexto && <span className={`${kicker} text-loja-preco`}>{contexto}</span>}
        <h1 className="manchete text-[2.4rem] text-forest-dark sm:text-[2.9rem]">{titulo}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </header>
  );
}
