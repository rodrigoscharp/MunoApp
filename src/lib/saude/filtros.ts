import type { ChavePeca } from "./origens";

/** Os filtros do feed vivem na URL: o rewrite do console preserva a query string. */
export type FiltroDePeca = ChavePeca | "outros";
export type FiltrosDoFeed = { todos: boolean; peca: FiltroDePeca | null; tenantId: string | null };

const PECAS_DO_FEED: readonly FiltroDePeca[] = ["cron", "webhook-asaas", "pagamentos", "email", "rotas", "outros"];

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function lerFiltros(sp: Record<string, string | string[] | undefined>): FiltrosDoFeed {
  const peca = primeiro(sp.peca);
  return {
    todos: primeiro(sp.todos) === "1",
    peca: PECAS_DO_FEED.includes(peca as FiltroDePeca) ? (peca as FiltroDePeca) : null,
    tenantId: primeiro(sp.tenant) || null,
  };
}

export function hrefDoFiltro(atual: FiltrosDoFeed, mudanca: Partial<FiltrosDoFeed>): string {
  const f = { ...atual, ...mudanca };
  const q = new URLSearchParams();
  if (f.todos) q.set("todos", "1");
  if (f.peca) q.set("peca", f.peca);
  if (f.tenantId) q.set("tenant", f.tenantId);
  const s = q.toString();
  return s ? `/saude?${s}` : "/saude";
}
