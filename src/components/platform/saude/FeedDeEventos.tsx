import Link from "next/link";
import type { LinhaDoFeed } from "@/lib/saude/coletar";
import { hrefDoFiltro, type FiltroDePeca, type FiltrosDoFeed } from "@/lib/saude/filtros";
import { tempoDesde } from "@/lib/saude/tempo";

const OPCOES: { valor: FiltroDePeca | null; rotulo: string }[] = [
  { valor: null, rotulo: "Tudo" },
  { valor: "cron", rotulo: "Cron" },
  { valor: "webhook-asaas", rotulo: "Asaas" },
  { valor: "pagamentos", rotulo: "Pagamentos" },
  { valor: "email", rotulo: "E-mail" },
  { valor: "rotas", rotulo: "Rotas" },
  { valor: "outros", rotulo: "Outros" },
];

const TOM_DO_NIVEL = {
  OK: "text-console-mudo",
  AVISO: "text-console-aviso",
  ERRO: "text-console-alerta",
} as const;

const HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function Pilula({ href, ativo, children }: { href: string; ativo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={ativo ? "true" : undefined}
      className={`h-8 px-3 inline-flex items-center rounded-full text-[13px] transition-colors ${
        ativo ? "bg-console-cartao text-console-tinta font-semibold shadow-sm" : "text-console-segunda hover:text-console-tinta"
      }`}
    >
      {children}
    </Link>
  );
}

export function FeedDeEventos({
  linhas,
  filtros,
  agora,
}: {
  linhas: LinhaDoFeed[] | null;
  filtros: FiltrosDoFeed;
  agora: Date;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {OPCOES.map((o) => (
          <Pilula key={o.rotulo} href={hrefDoFiltro(filtros, { peca: o.valor })} ativo={filtros.peca === o.valor}>
            {o.rotulo}
          </Pilula>
        ))}
        <span className="mx-1 h-5 w-px bg-console-linha" aria-hidden />
        <Pilula href={hrefDoFiltro(filtros, { todos: !filtros.todos })} ativo={filtros.todos}>
          {filtros.todos ? "Mostrando os OK" : "Mostrar os OK"}
        </Pilula>
        {filtros.tenantId && (
          <Pilula href={hrefDoFiltro(filtros, { tenantId: null })} ativo>
            Só um restaurante ✕
          </Pilula>
        )}
      </div>

      {linhas === null ? (
        <p className="text-sm text-console-mudo py-6">Não foi possível ler os eventos agora.</p>
      ) : linhas.length === 0 ? (
        <p className="text-sm text-console-mudo py-6">Nenhum evento com esses filtros.</p>
      ) : (
        <ol className="divide-y divide-console-linha">
          {linhas.map((l) => (
            <li key={l.id} className="py-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
              <span className={`font-semibold ${TOM_DO_NIVEL[l.nivel]}`}>{l.nivel}</span>
              <span className="text-console-tinta break-words">{l.mensagem}</span>
              <span />
              <span className="text-[12px] text-console-mudo">
                <time dateTime={l.criadoEm.toISOString()} title={HORA.format(l.criadoEm)}>
                  {tempoDesde(l.criadoEm, agora)}
                </time>
                {" · "}
                <code className="font-mono">{l.origem}</code>
                {l.restaurante && l.tenantId && (
                  <>
                    {" · "}
                    <Link href={hrefDoFiltro(filtros, { tenantId: l.tenantId })} className="underline underline-offset-2">
                      {l.restaurante}
                    </Link>
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
