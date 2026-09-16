/**
 * A moldura dos blocos do console, no desenho do Core 2.0: cartão de vidro
 * canelado, raio grande, título em peso médio e a entrada em cascata.
 *
 * `atraso` escalona a animação de entrada. Os blocos sobem um depois do outro
 * na ordem de leitura, e não todos juntos, porque é a ordem que diz ao olho por
 * onde começar.
 */
export function Painel({
  titulo,
  subtitulo,
  acessorio,
  atraso = 0,
  className = "",
  children,
}: {
  titulo?: React.ReactNode;
  subtitulo?: string;
  acessorio?: React.ReactNode;
  atraso?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`console-vidro console-entra rounded-[22px] sm:rounded-[28px] p-4 sm:p-7 h-full ${className}`}
      style={{ "--atraso": `${atraso}ms` } as React.CSSProperties}
    >
      {titulo && (
        <header className="flex items-start justify-between gap-3 mb-5 sm:mb-6">
          <div className="min-w-0">
            <h2 className="text-[17px] sm:text-[20px] font-semibold tracking-[-0.015em] text-console-tinta">
              {titulo}
            </h2>
            {subtitulo && (
              <p className="text-[12px] sm:text-[13px] text-console-mudo mt-1 leading-snug">
                {subtitulo}
              </p>
            )}
          </div>
          {acessorio}
        </header>
      )}
      {children}
    </section>
  );
}
