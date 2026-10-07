import type { Peca, Saude } from "@/lib/saude/avaliar";
import { tempoDesde } from "@/lib/saude/tempo";
import { ROTULO_DA_COR, TOM_DA_COR } from "./cores";

/**
 * Rotas não têm batimento: o instante guardado na peça é o do último ERRO, e
 * "último sinal" ali leria como "respondeu há pouco", o contrário do que é.
 */
function rodape(p: Peca, agora: Date): string {
  if (p.chave === "rotas") {
    return p.ultimoSinal ? `último erro ${tempoDesde(p.ultimoSinal, agora)}` : "nenhum erro registrado";
  }
  return p.ultimoSinal ? `último sinal ${tempoDesde(p.ultimoSinal, agora)}` : "sem sinal registrado";
}

export function GradeDaSaude({ saude, agora }: { saude: Saude; agora: Date }) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {saude.pecas.map((p, i) => (
        <article
          key={p.chave}
          className="console-vidro console-entra rounded-[22px] p-4 sm:p-5"
          style={{ "--atraso": `${i * 40}ms` } as React.CSSProperties}
        >
          <header className="flex items-center gap-2.5">
            <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${TOM_DA_COR[p.cor]}`} />
            <h2 className="text-[15px] font-semibold text-console-tinta">{p.nome}</h2>
            <span className="sr-only">{ROTULO_DA_COR[p.cor]}</span>
          </header>
          <p className="mt-2 text-[13px] leading-snug text-console-segunda">{p.motivo}</p>
          <p className="mt-3 text-[12px] text-console-mudo">{rodape(p, agora)}</p>
        </article>
      ))}
    </section>
  );
}
