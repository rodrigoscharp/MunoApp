import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import type { DadosDeSaude } from "@/lib/saude/avaliar";

const coletar = vi.fn<(agora: Date) => Promise<DadosDeSaude>>();
vi.mock("@/lib/saude/coletar", () => ({ coletarDadosDeSaude: (a: Date) => coletar(a) }));

const { GET } = await import("./route");

const TOKEN = "segredo-do-monitor-com-tamanho";
const req = (opcoes: { header?: string; query?: string } = {}) =>
  new NextRequest(`https://munoapp.com.br/api/health/sistema${opcoes.query ? `?token=${opcoes.query}` : ""}`, {
    headers: opcoes.header ? { authorization: opcoes.header } : {},
  });

const saudavel = (): DadosDeSaude => ({
  banco: { ok: true, ms: 10 },
  leitura: {
    eventos: [],
    ultimoCron: { origem: "cron/assinaturas", nivel: "OK", criadoEm: new Date(Date.now() - 3_600_000) },
    primeiroEvento: new Date(Date.now() - 100 * 3_600_000),
    inscricoesPagas: { total: 0, maisAntiga: null },
    pedidos: { naUltimaHora: 0, mesmaHoraAntes: [0, 0, 0, 0], ultimoPedido: null },
  },
});

beforeEach(() => {
  coletar.mockReset();
  vi.stubEnv("HEALTH_MONITOR_TOKEN", TOKEN);
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health/sistema: quem entra", () => {
  it.each([
    ["sem token", {}],
    ["token errado no header", { header: "Bearer outro-segredo-de-mesmo-tamanho" }],
    ["token de tamanho diferente", { header: "Bearer x" }],
    ["Bearer vazio", { header: "Bearer " }],
    ["token errado na query", { query: "nada" }],
  ])("401 %s, sem coletar", async (_nome, opcoes) => {
    const res = await GET(req(opcoes));
    expect(res.status).toBe(401);
    expect(coletar).not.toHaveBeenCalled();
  });

  it("401 quando a variável não está configurada, mesmo com token vazio", async () => {
    vi.stubEnv("HEALTH_MONITOR_TOKEN", "");
    const res = await GET(req({ header: "Bearer " }));
    expect(res.status).toBe(401);
    expect(coletar).not.toHaveBeenCalled();
  });

  it("aceita o token no header e na query", async () => {
    coletar.mockResolvedValue(saudavel());
    expect((await GET(req({ header: `Bearer ${TOKEN}` }))).status).toBe(200);
    expect((await GET(req({ query: TOKEN }))).status).toBe(200);
  });
});

describe("GET /api/health/sistema: o que responde", () => {
  it("200 sem vermelhas, sem cache", async () => {
    coletar.mockResolvedValue(saudavel());
    const res = await GET(req({ query: TOKEN }));
    expect(await res.json()).toEqual({ ok: true, vermelhas: [] });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("amarelo não derruba o monitor", async () => {
    const d = saudavel();
    d.leitura!.eventos = [{ origem: "render:/adm", nivel: "ERRO", criadoEm: new Date() }];
    coletar.mockResolvedValue(d);
    expect((await GET(req({ query: TOKEN }))).status).toBe(200);
  });

  it("503 com a chave da peça vermelha", async () => {
    const d = saudavel();
    d.leitura!.inscricoesPagas = { total: 1, maisAntiga: new Date(Date.now() - 2 * 3_600_000) };
    coletar.mockResolvedValue(d);
    const res = await GET(req({ query: TOKEN }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, vermelhas: ["provisionamento"] });
  });

  it("banco fora do ar responde 503 com banco, sem 500", async () => {
    coletar.mockResolvedValue({ banco: { ok: false, ms: 3000 }, leitura: null });
    const res = await GET(req({ query: TOKEN }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, vermelhas: ["banco"] });
  });
});
