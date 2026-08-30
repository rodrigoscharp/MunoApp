import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

/**
 * TESTES DE COSTURA do funil de aquisição — da página de vendas até a
 * credencial chegar no e-mail do cliente.
 *
 * Cada peça desta cadeia já tem suíte própria, e todas passam com as vizinhas
 * mockadas. É exatamente esse o buraco: um mock concorda com qualquer coisa.
 * Se a landing renomear um campo, se o `origem` do Lead divergir entre quem
 * escreve e quem fecha, ou se um CTA sair com um plano que a página não
 * reconhece, TODAS as suítes continuam verdes — e a receita some sem nenhum
 * erro em lugar nenhum.
 *
 * Os testes daqui não exercitam comportamento novo. Eles afirmam que as
 * pontas encaixam.
 */

const leadFindMany = vi.fn();
const leadCreate = vi.fn();
const leadUpdate = vi.fn();
const leadFindFirstTx = vi.fn();
const leadUpdateTx = vi.fn();
const leadUpdateManyTx = vi.fn();
const tenantFindUnique = vi.fn();
const inscricaoFindUnique = vi.fn();
const inscricaoCreate = vi.fn();
const inscricaoUpdate = vi.fn();
const inscricaoDelete = vi.fn();
const tokenCreate = vi.fn();

vi.mock("@/lib/prisma", () => {
  const tx = {
    assinatura: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "assin-1" }),
    },
    cobranca: { create: vi.fn().mockResolvedValue({}) },
    inscricao: { update: vi.fn().mockResolvedValue({}) },
    lead: {
      findFirst: (...a: unknown[]) => leadFindFirstTx(...a),
      update: (...a: unknown[]) => leadUpdateTx(...a),
      updateMany: (...a: unknown[]) => leadUpdateManyTx(...a),
    },
  };
  const cliente = {
    lead: {
      findMany: (...a: unknown[]) => leadFindMany(...a),
      create: (...a: unknown[]) => leadCreate(...a),
      update: (...a: unknown[]) => leadUpdate(...a),
    },
    tenant: { findUnique: (...a: unknown[]) => tenantFindUnique(...a) },
    inscricao: {
      findUnique: (...a: unknown[]) => inscricaoFindUnique(...a),
      create: (...a: unknown[]) => inscricaoCreate(...a),
      update: (...a: unknown[]) => inscricaoUpdate(...a),
      delete: (...a: unknown[]) => inscricaoDelete(...a),
    },
    passwordResetToken: { create: (...a: unknown[]) => tokenCreate(...a) },
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  };
  return { prismaUnscoped: cliente, prisma: cliente };
});

vi.mock("@/lib/assinatura/asaas", () => ({
  criarCliente: vi.fn().mockResolvedValue({ id: "cus_1" }),
  criarAssinatura: vi.fn().mockResolvedValue({ id: "sub_1" }),
  listarCobrancasDaAssinatura: vi
    .fn()
    .mockResolvedValue({ data: [{ id: "pay_1", invoiceUrl: "https://asaas/i/1" }] }),
}));

vi.mock("@/lib/tenant-provisioning", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return {
    ...real,
    provisionTenant: vi.fn().mockResolvedValue({
      tenant: { id: "tenant-1", slug: "pizzaria-do-ze" },
      admin: { id: "admin-1" },
    }),
  };
});

const enviarEmail = vi.fn();
vi.mock("@/lib/resend", () => ({
  getResend: () => ({ emails: { send: (...a: unknown[]) => enviarEmail(...a) } }),
  resend: { emails: { send: (...a: unknown[]) => enviarEmail(...a) } },
}));

const raiz = process.cwd();
const lerLanding = (p: string) => readFileSync(join(raiz, "public/vendas", p), "utf8");
const lerFonte = (p: string) => readFileSync(join(raiz, p), "utf8");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LANDING_ORIGIN = "http://localhost:3000";
  process.env.ROOT_DOMAIN = "www.munoapp.com.br,munoapp.com.br";
  leadFindMany.mockResolvedValue([]);
  leadCreate.mockResolvedValue({ id: "lead-1" });
  leadFindFirstTx.mockResolvedValue({ id: "lead-1" });
  leadUpdateManyTx.mockResolvedValue({ count: 0 });
  tenantFindUnique.mockResolvedValue(null);
  inscricaoFindUnique.mockResolvedValue(null);
  inscricaoCreate.mockResolvedValue({ id: "insc-1" });
  inscricaoUpdate.mockResolvedValue({});
  tokenCreate.mockResolvedValue({ token: "token-gerado" });
  enviarEmail.mockResolvedValue({ data: { id: "email-1" } });
});


/** Uma Inscricao completa, na forma que o provisionamento recebe do banco. */
function inscricaoDeTeste() {
  return {
    id: "insc-1",
    nome: "Pizzaria do Zé",
    slug: "pizzaria-do-ze",
    email: "dono@pizzaria.com",
    plano: "MEMBRO",
    ciclo: "MENSAL",
    status: "AGUARDANDO_PAGAMENTO",
    tenantId: null,
    asaasCustomerId: null,
    asaasPaymentId: null,
    asaasSubscriptionId: "sub_1",
    expiraEm: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ---------------------------------------------------------------------------

describe("costura 1 — a página de vendas fala a língua do endpoint de lead", () => {
  /** Os campos que o formulário da landing de fato envia. */
  function camposEnviadosPelaLanding(): string[] {
    const js = lerLanding("js/main.js");
    const corpo = js.slice(js.indexOf("ENDPOINT_LEAD"));
    const bloco = corpo.slice(corpo.indexOf("JSON.stringify({"));
    const fim = bloco.indexOf("})");
    return [...bloco.slice(0, fim).matchAll(/^\s*([a-zA-Z]+):/gm)].map((m) => m[1]);
  }

  it("o endpoint que a landing chama é uma rota que existe no app", () => {
    const js = lerLanding("js/main.js");
    const endpoint = /ENDPOINT_LEAD\s*=\s*'([^']+)'/.exec(js)?.[1];

    expect(endpoint).toBe("/api/leads/publico");
    expect(() =>
      readFileSync(join(raiz, "src/app/api/leads/publico/route.ts"))
    ).not.toThrow();
  });

  // O buraco que este teste tapa: a rota devolve 400 genérico para payload
  // inválido, e o fetch da landing engole a resposta de propósito. Renomear um
  // campo de um lado para de gravar TODOS os leads, e nada no sistema grita —
  // as conversas de WhatsApp continuam normais.
  it("o payload da landing é aceito pela rota, campo por campo", async () => {
    const campos = camposEnviadosPelaLanding();
    expect(campos.length).toBeGreaterThan(0);

    const valores: Record<string, string> = {
      restaurante: "Pizzaria do Zé",
      telefone: "(12) 99999-9999",
      plano: "Membro MUNO",
      website: "",
    };
    // Se a landing passar a mandar um campo que este teste não conhece, ele
    // falha aqui — de propósito: campo novo pede decisão, não silêncio.
    for (const campo of campos) {
      expect(Object.keys(valores)).toContain(campo);
    }

    const corpo = Object.fromEntries(campos.map((c) => [c, valores[c]]));
    const { POST } = await import("@/app/api/leads/publico/route");
    const res = await POST(
      new NextRequest("http://localhost/api/leads/publico", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          "x-forwarded-for": "203.0.113.1",
        },
        body: JSON.stringify(corpo),
      })
    );

    expect(res.status).toBe(201);
    expect(leadCreate).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------

describe("costura 2 — os CTAs da landing vendem o plano que a página cobra", () => {
  /** Todo par plano/ciclo que a landing consegue emitir, estático ou pelo toggle. */
  function combinacoesEmitidas(): { plano: string; ciclo: string }[] {
    const html = lerLanding("index.html");
    const js = lerLanding("js/main.js");
    const combos: { plano: string; ciclo: string }[] = [];

    for (const m of html.matchAll(/plano=([A-Z_]+)&ciclo=([A-Z]+)/g)) {
      combos.push({ plano: m[1], ciclo: m[2] });
    }
    // O toggle mensal/anual reescreve o href dos cards a partir de data-plano.
    for (const m of html.matchAll(/data-plano="([A-Z_]+)"/g)) {
      combos.push({ plano: m[1], ciclo: "MENSAL" });
      if (js.includes("ANUAL")) combos.push({ plano: m[1], ciclo: "ANUAL" });
    }
    return combos;
  }

  // O buraco: escolhaDaQueryString cai em MEMBRO/MENSAL para qualquer valor
  // que não reconheça — fail-closed correto para link velho, e desastre
  // silencioso para um CTA com erro de digitação. Quem clicasse em "Membro +
  // Mesas QR anual" compraria o plano mais barato no ciclo mensal, e a única
  // pista seria o faturamento não bater.
  it("todo plano e ciclo que a landing emite chega intacto no checkout", async () => {
    const { escolhaDaQueryString } = await import("@/lib/plans");
    const combos = combinacoesEmitidas();

    expect(combos.length).toBeGreaterThan(0);
    for (const combo of combos) {
      expect(escolhaDaQueryString(combo)).toEqual({
        plano: combo.plano,
        ciclo: combo.ciclo,
      });
    }
  });

  it("a landing não anuncia plano que a tabela de preços desconhece", async () => {
    const { PRECOS } = await import("@/lib/plans");

    for (const { plano } of combinacoesEmitidas()) {
      expect(Object.keys(PRECOS)).toContain(plano);
    }
  });
});

// ---------------------------------------------------------------------------

describe("costura 3 — o Lead que o checkout cria é o Lead que o provisionamento fecha", () => {
  // O buraco: são duas strings literais em arquivos diferentes. Divergir não
  // quebra nada — o restaurante nasce, o cliente entra, e o lead fica NOVO
  // para sempre no CRM. Ninguém percebe até alguém perguntar por que o funil
  // não fecha.
  it("a origem gravada no checkout é a mesma que o provisionamento procura", async () => {
    const { POST } = await import("@/app/api/assinar/route");
    await POST(
      new NextRequest("http://localhost/api/assinar", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.2" },
        body: JSON.stringify({
          nome: "Pizzaria do Zé",
          email: "dono@pizzaria.com",
          slug: "pizzaria-do-ze",
          cpfCnpj: "24971563792",
          plano: "MEMBRO",
          ciclo: "MENSAL",
          metodo: "CREDIT_CARD",
        }),
      })
    );
    const origemGravada = leadCreate.mock.calls[0][0].data.origem;

    const { provisionarInscricao } = await import("@/lib/assinatura/provisionamento");
    await provisionarInscricao(inscricaoDeTeste(), { origem: "teste" });
    const origemProcurada = leadFindFirstTx.mock.calls[0][0].where.origem;

    expect(origemProcurada).toBe(origemGravada);
  });

  it("o e-mail usado para achar o Lead é o mesmo que o checkout gravou", async () => {
    const { POST } = await import("@/app/api/assinar/route");
    await POST(
      new NextRequest("http://localhost/api/assinar", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.3" },
        body: JSON.stringify({
          nome: "Pizzaria do Zé",
          email: "dono@pizzaria.com",
          slug: "pizzaria-do-ze",
          cpfCnpj: "24971563792",
          plano: "MEMBRO",
          ciclo: "MENSAL",
          metodo: "CREDIT_CARD",
        }),
      })
    );

    expect(leadCreate.mock.calls[0][0].data.email).toBe("dono@pizzaria.com");
  });
});

// ---------------------------------------------------------------------------

describe("costura 4 — o link do e-mail abre a página que sabe recebê-lo", () => {
  async function linkDoEmail(): Promise<URL> {
    const { enviarBoasVindas } = await import("@/lib/assinatura/email-boas-vindas");
    await enviarBoasVindas({
      tenantId: "tenant-1",
      slug: "pizzaria-do-ze",
      email: "dono@pizzaria.com",
      nome: "Pizzaria do Zé",
    });
    const { html } = enviarEmail.mock.calls[0][0];
    const href = /href="([^"]*redefinir-senha[^"]*)"/.exec(html)?.[1];
    expect(href).toBeTruthy();
    return new URL(href!);
  }

  // O buraco: o e-mail monta a URL com uma string, a página lê o parâmetro com
  // outra. Renomear de um lado gera um link que abre a página e não faz nada —
  // e é a ÚNICA porta de entrada de quem acabou de pagar.
  // Desde 30/08/2026 a página é Server Component (ela busca o nome do
  // restaurante) e quem lê a query string é o formulário ao lado. A dupla
  // conta como "quem recebe o link", e a asserção passou a cobrir TODO
  // parâmetro em vez de exigir que exista um só: o e-mail agora manda também
  // `novo=1`, e um parâmetro que ninguém lê é tão quebrado quanto um
  // renomeado.
  const quemRecebeOLink = () =>
    lerFonte("src/app/(client)/redefinir-senha/page.tsx") +
    lerFonte("src/components/auth/ResetPasswordForm.tsx");

  it("todo parâmetro do link é lido por quem recebe a página", async () => {
    const url = await linkDoEmail();
    const recebe = quemRecebeOLink();

    const parametros = [...url.searchParams.keys()];
    expect(parametros).toContain("token");
    for (const nome of parametros) {
      expect(recebe).toContain(`searchParams.get("${nome}")`);
    }
  });

  it("o caminho do link é uma rota que existe no app", async () => {
    const url = await linkDoEmail();

    expect(url.pathname).toBe("/redefinir-senha");
    expect(() =>
      readFileSync(join(raiz, "src/app/(client)/redefinir-senha/page.tsx"))
    ).not.toThrow();
  });

  // O último elo: criada a senha, a tela empurra para o login. Se ela mandar
  // uma marca de primeiro acesso que o login não lê, quem acabou de criar a
  // senha é recebido com "Bem-vindo de volta" — de volta a um lugar onde nunca
  // esteve.
  it("a marca de primeiro acesso passada ao login é lida por ele", () => {
    const form = lerFonte("src/components/auth/ResetPasswordForm.tsx");
    const login = lerFonte("src/components/auth/LoginForm.tsx");

    const query = /["'`]\/login\?([^"'`]+)["'`]/.exec(form)?.[1] ?? "";
    const marca = /(\w+)=/.exec(query)?.[1];

    expect(marca).toBeTruthy();
    expect(login).toContain(`searchParams.get("${marca}")`);
  });

  // Sem isto o onboarding é inalcançável. O login mandava para "/" (a vitrine),
  // então o dono entrava na Muno pela primeira vez e caía no próprio cardápio,
  // como se fosse cliente dele, sem nunca ver o painel onde o onboarding mora.
  it("o login leva ADMIN ao painel, sem atropelar o callbackUrl", () => {
    const login = lerFonte("src/components/auth/LoginForm.tsx");

    expect(login).toContain('"/adm"');
    // callbackUrl continua mandando quando existe: quem foi barrado numa
    // página específica precisa voltar para ela, não para o painel.
    expect(login).toContain("callbackUrl");
  });

  it("a página envia o token para uma rota que existe", () => {
    const rota = /fetch\("([^"]+)"/.exec(quemRecebeOLink())?.[1];

    expect(rota).toBe("/api/auth/reset-password");
    expect(() =>
      readFileSync(join(raiz, "src/app/api/auth/reset-password/route.ts"))
    ).not.toThrow();
  });

  // O link precisa cair no host do RESTAURANTE, não no da plataforma: o token
  // de sessão vale na origem do tenant. Um link no apex leva a pessoa para a
  // landing de vendas.
  it("o link aponta para o subdomínio do restaurante, não para o domínio raiz", async () => {
    const url = await linkDoEmail();

    expect(url.host).toBe("pizzaria-do-ze.munoapp.com.br");
  });

  // O lead do formulário da landing tem origem "landing"; o do checkout,
  // "checkout". Fechar só o segundo deixava o primeiro NOVO para sempre — o
  // CRM mostrando oportunidade em aberto de quem já é cliente pagante. Esta
  // costura afirma que o provisionamento alcança os dois, e que a origem
  // gravada pela landing é justamente uma das que ele fecha.
  it("o lead da landing, de outra origem, também é fechado pelo provisionamento", async () => {
    const { ORIGEM_LANDING } = await import("@/lib/lead-landing");
    const { provisionarInscricao } = await import("@/lib/assinatura/provisionamento");

    await provisionarInscricao(inscricaoDeTeste(), { origem: "teste" });

    const where = leadUpdateManyTx.mock.calls[0][0].where;
    // A cláusula não filtra por origem: alcança "landing", "checkout" e
    // qualquer outra que venha a existir.
    expect(where.origem).toBeUndefined();
    expect(where.email).toBe("dono@pizzaria.com");
    expect(ORIGEM_LANDING).toBeTruthy();
  });
});
