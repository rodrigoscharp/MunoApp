/**
 * O que o console mostra entre o clique e a resposta do servidor.
 *
 * Toda tela do console é dinâmica e consulta o banco, então sem este arquivo o
 * clique no menu não dava sinal nenhum até a página inteira chegar: a tela
 * velha ficava parada e parecia travada. Com ele, o Next prefetcha esta casca
 * junto do link e troca a tela no mesmo instante do clique.
 *
 * Fica dentro do layout, então menu e selos continuam no lugar; só o
 * conteúdo vira esqueleto. Sem `console-entra`: animar a espera atrasaria o
 * próprio aviso de que algo está acontecendo.
 */
export default function ConsoleCarregando() {
  return (
    <div className="space-y-4 sm:space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="h-[32px] sm:h-[44px] w-56 rounded-xl bg-console-tinta/[0.06] animate-pulse mt-2 mb-3 sm:mb-5" />
      <div className="console-vidro rounded-[22px] sm:rounded-[28px] p-4 sm:p-7">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded-2xl bg-console-tinta/[0.05] animate-pulse"
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className="console-vidro rounded-[22px] sm:rounded-[28px] h-72 lg:col-span-2 animate-pulse" />
        <div className="console-vidro rounded-[22px] sm:rounded-[28px] h-72 animate-pulse" />
      </div>
    </div>
  );
}
