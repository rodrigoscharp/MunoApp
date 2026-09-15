/**
 * A matriz de acesso: todo handler de API contra o manifesto.
 *
 * Três afirmações, e a ordem importa para ler uma falha:
 *
 * 1. Cobertura. Todo handler tem política e toda política tem handler.
 * 2. Negação. Quem não está na política recebe resposta fora de 2xx E a rota
 *    não toca o banco. A segunda metade é a que pega o bug sutil: consultar e
 *    só depois checar o papel já vazou tempo de resposta e efeito colateral,
 *    mesmo que o fim seja um 403.
 * 3. Controle positivo. Quem está na política não leva 401 nem 403. Sem isto a
 *    matriz passaria contra uma rota que recusa todo mundo, ou contra um mock
 *    que não pegou.
 *
 * A matriz testa o handler isolado. Sessão de OUTRO tenant é barrada pelo
 * proxy, não pelo handler, e o teste disso mora em src/proxy.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POLITICA, type Nivel, type Papel } from "./politica-de-acesso";

// --- dublês -------------------------------------------------------------------

const espiao = vi.hoisted(() => {
  const acessos: string[] = [];

  /**
   * Cliente que aceita qualquer caminho (`prisma.order.findMany(...)`), anota
   * cada propriedade lida e resolve toda chamada com undefined.
   *
   * `then` volta undefined sem anotar: o `await` de um valor pergunta por ele,
   * e um `then` que devolvesse função faria o await esperar para sempre.
   */
  function cliente(nome: string): unknown {
    return new Proxy(() => Promise.resolve(undefined), {
      get(_alvo, prop) {
        if (prop === "then" || typeof prop === "symbol") return undefined;
        acessos.push(`${nome}.${String(prop)}`);
        return cliente(`${nome}.${String(prop)}`);
      },
      apply: () => Promise.resolve(undefined),
    });
  }

  return { acessos, cliente };
});

const sessoes = vi.hoisted(() => ({
  tenant: null as unknown,
  plataforma: null as unknown,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: espiao.cliente("prisma"),
  prismaUnscoped: espiao.cliente("prismaUnscoped"),
}));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: espiao.cliente("supabaseAdmin") }));
vi.mock("@/lib/resend", () => ({ resend: espiao.cliente("resend") }));
vi.mock("@/lib/auth", () => ({
  auth: async () => sessoes.tenant,
  handlers: {},
  signIn: async () => undefined,
  signOut: async () => undefined,
}));
vi.mock("@/lib/auth-platform", () => ({
  authPlatform: async () => sessoes.plataforma,
  platformHandlers: {},
  signInPlatform: async () => undefined,
  signOutPlatform: async () => undefined,
}));

// --- varredura ------------------------------------------------------------------

type Handler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<Response>;

interface Alvo {
  chave: string;
  metodo: string;
  caminho: string;
  handler: Handler;
  params: Record<string, string>;
}

const METODOS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const TENANT = "tenant-da-matriz";

const alvos: Alvo[] = [];
for (const [arquivo, carregar] of Object.entries(import.meta.glob("../app/api/**/route.ts"))) {
  // Handlers do próprio NextAuth: sustentam o login e não são código nosso.
  if (arquivo.includes("[...nextauth]")) continue;

  const caminho = arquivo.replace(/^\.\.\/app/, "").replace(/\/route\.ts$/, "");
  const params = Object.fromEntries(
    [...caminho.matchAll(/\[([^\]]+)\]/g)].map((m) => [m[1], "id-teste"])
  );
  const modulo = (await carregar()) as Record<string, unknown>;

  for (const metodo of METODOS) {
    if (typeof modulo[metodo] !== "function") continue;
    alvos.push({
      chave: `${metodo} ${caminho}`,
      metodo,
      caminho,
      handler: modulo[metodo] as Handler,
      params,
    });
  }
}

type Quem = "NINGUEM" | Papel | "PLATAFORMA";
const TODOS: Quem[] = ["NINGUEM", "CUSTOMER", "ADMIN", "KITCHEN", "MOTOBOY", "PLATAFORMA"];

function entrarComo(quem: Quem) {
  sessoes.tenant =
    quem === "NINGUEM" || quem === "PLATAFORMA"
      ? null
      : { user: { id: "user-da-matriz", name: "Teste", email: "t@exemplo.com", role: quem, tenantId: TENANT } };
  sessoes.plataforma =
    quem === "PLATAFORMA" ? { user: { id: "admin-da-matriz", name: "Admin", email: "a@exemplo.com" } } : null;
}

function requisicao(alvo: Alvo): NextRequest {
  const url = `http://restaurante.localhost:3000${alvo.caminho.replace(/\[[^\]]+\]/g, "id-teste")}`;
  const temCorpo = !["GET", "HEAD", "OPTIONS"].includes(alvo.metodo);
  return new NextRequest(url, {
    method: alvo.metodo,
    headers: {
      "x-tenant-id": TENANT,
      // O plano mais alto, para a trava de plano não mascarar a falta de trava
      // de papel com um 403 que parece certo.
      "x-tenant-plano": "MEMBRO_MESA_QR",
      "content-type": "application/json",
    },
    ...(temCorpo ? { body: "{}" } : {}),
  });
}

/** A resposta, ou o erro que o handler deixou escapar. */
async function chamar(alvo: Alvo): Promise<Response | Error> {
  try {
    return await alvo.handler(requisicao(alvo), { params: Promise.resolve(alvo.params) });
  } catch (erro) {
    return erro instanceof Error ? erro : new Error(String(erro));
  }
}

const nivelDe = (alvo: Alvo): Nivel | undefined => POLITICA[alvo.chave];
const exigeSessao = (alvo: Alvo) => nivelDe(alvo)?.tipo === "AUTENTICADO";
const aceitos = (alvo: Alvo) =>
  (nivelDe(alvo) as Extract<Nivel, { tipo: "AUTENTICADO" }>).aceita;

beforeEach(() => {
  espiao.acessos.length = 0;
  entrarComo("NINGUEM");
  vi.stubEnv("CRON_SECRET", "segredo-do-cron-da-matriz");
  vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "token-do-asaas-da-matriz");
  // Nenhum handler sai para a rede a partir daqui.
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("rede bloqueada na matriz de acesso");
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// --- 1. cobertura -------------------------------------------------------------------

describe("toda rota de API tem política declarada", () => {
  it("a varredura encontrou handlers", () => {
    expect(alvos.length).toBeGreaterThan(0);
  });

  it("todo handler exportado está no manifesto", () => {
    expect(alvos.map((a) => a.chave).filter((c) => !(c in POLITICA))).toEqual([]);
  });

  it("toda entrada do manifesto aponta para um handler que existe", () => {
    const existentes = new Set(alvos.map((a) => a.chave));
    expect(Object.keys(POLITICA).filter((c) => !existentes.has(c))).toEqual([]);
  });

  it("todo motivo é uma frase, não um carimbo", () => {
    const curtos = Object.entries(POLITICA)
      .filter(([, n]) => n.tipo !== "AUTENTICADO" && n.motivo.trim().length < 20)
      .map(([chave]) => chave);
    expect(curtos).toEqual([]);
  });

  it("toda rota autenticada aceita alguém", () => {
    const vazias = Object.entries(POLITICA)
      .filter(([, n]) => n.tipo === "AUTENTICADO" && n.aceita.length === 0)
      .map(([chave]) => chave);
    expect(vazias).toEqual([]);
  });
});

// --- 2. negação -------------------------------------------------------------------------

const casosDeNegacao = alvos
  .filter(exigeSessao)
  .flatMap((alvo) =>
    TODOS.filter((quem) => quem === "NINGUEM" || !aceitos(alvo).includes(quem)).map(
      (quem) => [alvo.chave, quem, alvo] as const
    )
  );

describe("quem não está na política é recusado antes do banco", () => {
  it.each(casosDeNegacao)("%s como %s", async (_chave, quem, alvo) => {
    entrarComo(quem);

    const res = await chamar(alvo);

    expect(res, `lançou em vez de responder: ${String(res)}`).toBeInstanceOf(Response);
    expect((res as Response).status, "respondeu 2xx").not.toBeLessThan(300);
    expect(espiao.acessos, "tocou o banco antes de recusar").toEqual([]);
  });
});

const casosDeSegredo = alvos
  .filter((alvo) => nivelDe(alvo)?.tipo === "SEGREDO")
  .map((alvo) => [alvo.chave, alvo] as const);

describe("rota de segredo sem o segredo é recusada antes do banco", () => {
  it.each(casosDeSegredo)("%s, mesmo com sessão de ADMIN", async (_chave, alvo) => {
    // A sessão está aqui para provar que ela não abre a porta.
    entrarComo("ADMIN");

    const res = await chamar(alvo);

    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).not.toBeLessThan(300);
    expect(espiao.acessos).toEqual([]);
  });
});

// --- 3. controle positivo -----------------------------------------------------------

const casosPositivos = alvos
  .filter(exigeSessao)
  .map((alvo) => [alvo.chave, aceitos(alvo)[0], alvo] as const);

describe("quem está na política não é barrado", () => {
  it.each(casosPositivos)("%s como %s", async (_chave, quem, alvo) => {
    entrarComo(quem);

    const res = await chamar(alvo);

    // O banco de mentira devolve undefined, então a rota pode quebrar mais
    // adiante, com 400, 404, 500 ou exceção. Tudo isso prova que ela passou
    // da checagem de acesso. Só 401 e 403 provariam o contrário.
    if (res instanceof Response) {
      expect([401, 403]).not.toContain(res.status);
    }
  });
});
