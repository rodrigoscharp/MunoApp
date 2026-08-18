import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { authPlatform } from "@/lib/auth-platform";

/**
 * O primeiro teste do proxy — e ele existe para uma pergunta só:
 * "isso pode derrubar o cardápio de um cliente?".
 *
 * src/proxy.ts é o arquivo por onde passa toda requisição do produto. Um erro
 * aqui não é um número errado numa tela: é um restaurante pagante sem vender
 * em horário de pico, com o prejuízo caindo no caixa dele. Por isso a primeira
 * afirmação deste arquivo é a lista de caminhos de operação, e não o bloqueio.
 */

// --- mocks -----------------------------------------------------------------

type Sessao = {
  user: { id: string; role: string; tenantId: string };
} | null;

type Proxy = (req: NextRequest) => Promise<Response>;

// O proxy é exportado embrulhado em auth(), que injeta req.auth antes de
// chamar o handler. Aqui o wrapper é a identidade e a sessão vai colada no
// request, como o NextAuth faria: assim o arquivo testa o roteamento, não o
// NextAuth.
vi.mock("@/lib/auth", () => ({
  auth: (handler: Proxy) => handler,
}));

// Só é consultado no subdomínio da plataforma, que não é assunto deste
// arquivo. Está aqui porque src/proxy.ts importa o módulo, e importar o
// NextAuth de verdade traria a conexão do banco junto.
vi.mock("@/lib/auth-platform", () => ({
  authPlatform: vi.fn(async () => null),
}));

const findUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: (...args: unknown[]) => findUnique(...args),
    },
  },
}));

const proxy = (await import("@/proxy")).default as unknown as Proxy;

// --- helpers ---------------------------------------------------------------

const TENANT_ID = "tenant-burguer";

// ROOT_DOMAIN não está definido no ambiente de teste, então o proxy usa o
// padrão "localhost:3000" e resolve o slug de burguer.localhost:3000.
const HOST = "burguer.localhost:3000";

const DONO: Sessao = {
  user: { id: "user-1", role: "ADMIN", tenantId: TENANT_ID },
};

function requisicao(caminho: string, sessao: Sessao = null): NextRequest {
  const req = new NextRequest(`http://${HOST}${caminho}`, {
    headers: { host: HOST },
  });
  (req as unknown as { auth: Sessao }).auth = sessao;
  return req;
}

const ADMIN_HOST = "admin.localhost:3000";

function requisicaoPlataforma(caminho: string, method = "GET"): NextRequest {
  const req = new NextRequest(`http://${ADMIN_HOST}${caminho}`, {
    headers: { host: ADMIN_HOST },
    method,
  });
  (req as unknown as { auth: Sessao }).auth = null;
  return req;
}

/** Status da assinatura do tenant; `null` = tenant sem assinatura nenhuma. */
function comAssinatura(status: string | null, plano: string = "MEMBRO") {
  findUnique.mockResolvedValue({
    id: TENANT_ID,
    status: "active",
    plano,
    assinatura: status === null ? null : { status },
  });
}

/** Para onde o proxy mandou a requisição, ou null se ela seguiu adiante. */
const destino = (res: Response) => res.headers.get("location");

/** x-tenant-id que o proxy injetou no request encaminhado, se injetou. */
const tenantInjetado = (res: Response) =>
  res.headers.get("x-middleware-request-x-tenant-id");

/** x-tenant-plano que o proxy injetou no request encaminhado, se injetou. */
const planoInjetado = (res: Response) =>
  res.headers.get("x-middleware-request-x-tenant-plano");

beforeEach(() => {
  vi.clearAllMocks();
  comAssinatura("ATIVA");
  vi.mocked(authPlatform).mockResolvedValue(null as never);
});

// --- testes ----------------------------------------------------------------

describe("proxy: inadimplência bloqueia gestão, nunca operação", () => {
  // O teste que justifica este arquivo existir. Se ele falhar, um restaurante
  // pagante ficou sem vender por causa de uma fatura.
  it.each([
    "/",
    "/cart",
    "/checkout",
    "/track/pedido-1",
    "/mesa/abc/cardapio",
    "/dashboard",
    "/motoboy/pedidos",
  ])("assinatura BLOQUEADA não afeta %s", async (caminho) => {
    comAssinatura("BLOQUEADA");

    const res = await proxy(requisicao(caminho, DONO));

    expect(destino(res)).toBeNull();
    expect(res.status).toBe(200);
    expect(tenantInjetado(res)).toBe(TENANT_ID);
  });

  // A mesma lista pelos olhos de quem compra: sem sessão nenhuma. Um bloqueio
  // que escapasse do bloco de /adm pegaria justamente este caminho, o do
  // cliente que só quer ver o cardápio e pedir.
  it.each(["/", "/cart", "/track/pedido-1", "/mesa/abc/cardapio"])(
    "assinatura BLOQUEADA não afeta %s para quem não tem login",
    async (caminho) => {
      comAssinatura("BLOQUEADA");

      const res = await proxy(requisicao(caminho));

      expect(destino(res)).toBeNull();
      expect(res.status).toBe(200);
      expect(tenantInjetado(res)).toBe(TENANT_ID);
    }
  );
});

describe("proxy: bloqueio da área de gestão", () => {
  it.each([
    "/adm",
    "/adm/menu",
    "/adm/pagamentos",
    "/adm/mesas",
    "/adm/restaurante",
    // O cadastro de motoboys é gestão e fica bloqueado. O app do entregador
    // (/motoboy/pedidos) não mora aqui e segue de pé — está na lista de
    // operação lá em cima.
    "/adm/motoboys",
  ])(
    "assinatura BLOQUEADA redireciona %s para /adm/assinatura",
    async (caminho) => {
      comAssinatura("BLOQUEADA");

      const res = await proxy(requisicao(caminho, DONO));

      // Host preservado: o redirect precisa ficar no subdomínio do
      // restaurante, e não sair para o NEXTAUTH_URL.
      expect(destino(res)).toBe(`http://${HOST}/adm/assinatura`);
    }
  );

  // O critério da lista de escape é uma pergunta só: algum cliente do
  // restaurante sofre se isto for bloqueado? Pedido que chegou e ninguém está
  // olhando é pedido perdido; mensagem sem resposta é um cliente no vácuo.
  // Isso não é pressão sobre o dono, é dano colateral em quem nunca deveu nada.
  it.each([
    // A página que resolve a pendência: sem ela o dono é mandado em loop para
    // longe da única tela que o desbloqueia.
    "/adm/assinatura",
    "/adm/assinatura/pagar",
    "/adm/orders",
    "/adm/orders/pedido-1",
    "/adm/chats",
    "/adm/chats/pedido-1",
  ])("%s escapa do bloqueio", async (caminho) => {
    comAssinatura("BLOQUEADA");

    const res = await proxy(requisicao(caminho, DONO));

    expect(destino(res)).toBeNull();
    expect(res.status).toBe(200);
    expect(tenantInjetado(res)).toBe(TENANT_ID);
  });

  it.each(["/adm/ordersettings", "/adm/chatsapp", "/adm/assinaturas-antigas"])(
    "%s não escapa por parecer com uma rota liberada",
    async (caminho) => {
      // Rotas que ainda não existem, e é exatamente esse o ponto: o escape
      // casa por segmento de caminho, não por texto. Um startsWith cru
      // liberaria qualquer rota futura que só comece com o mesmo prefixo — um
      // relatório de pedidos chamado /adm/ordersRelatorio entraria de carona.
      comAssinatura("BLOQUEADA");

      const res = await proxy(requisicao(caminho, DONO));

      expect(destino(res)).toBe(`http://${HOST}/adm/assinatura`);
    }
  );

  it.each(["ATIVA", "INADIMPLENTE"])("status %s não bloqueia o /adm", async (status) => {
    // INADIMPLENTE avisa na tela, não impede: sete dias de atraso não podem
    // custar o acesso à gestão.
    comAssinatura(status);

    const res = await proxy(requisicao("/adm", DONO));

    expect(destino(res)).toBeNull();
    expect(res.status).toBe(200);
    expect(tenantInjetado(res)).toBe(TENANT_ID);
  });

  it("status CANCELADA não bloqueia o /adm", async () => {
    // CANCELADA é a plataforma dizendo "este cliente não paga mensalidade"
    // (cortesia, encerramento combinado), não um atraso. Quem tira o acesso de
    // um restaurante encerrado é a remoção do tenant, não a régua de cobrança.
    comAssinatura("CANCELADA");

    const res = await proxy(requisicao("/adm", DONO));

    expect(destino(res)).toBeNull();
    expect(res.status).toBe(200);
  });

  it("tenant sem assinatura nenhuma não é bloqueado", async () => {
    // A relação é opcional: restaurante em implantação, cortesia ou anterior à
    // régua não tem registro de assinatura. Ausência de cobrança não é
    // inadimplência — na dúvida o proxy deixa passar, porque o erro para o
    // outro lado tranca o dono para fora da própria gestão.
    comAssinatura(null);

    const res = await proxy(requisicao("/adm", DONO));

    expect(destino(res)).toBeNull();
    expect(res.status).toBe(200);
    expect(tenantInjetado(res)).toBe(TENANT_ID);
  });

  it("o bloqueio não passa na frente da checagem de papel", async () => {
    // Um garçom no /adm de um restaurante bloqueado continua indo para "/", e
    // não para a tela de assinatura: papel primeiro, cobrança depois.
    comAssinatura("BLOQUEADA");

    const res = await proxy(
      requisicao("/adm", {
        user: { id: "user-2", role: "KITCHEN", tenantId: TENANT_ID },
      })
    );

    expect(destino(res)).toBe(`http://${HOST}/`);
  });

  it("busca a assinatura junto do tenant, numa consulta só", async () => {
    // O proxy roda em toda requisição: uma segunda ida ao banco por causa da
    // cobrança sairia caro em cada carregamento de cardápio.
    await proxy(requisicao("/adm", DONO));

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique.mock.calls[0][0].select).toMatchObject({
      plano: true,
      assinatura: { select: { status: true } },
    });
  });

  it("injeta o plano do tenant no request encaminhado", async () => {
    comAssinatura("ATIVA", "MEMBRO_MESA_QR");

    const res = await proxy(requisicao("/", DONO));

    expect(planoInjetado(res)).toBe("MEMBRO_MESA_QR");
  });
});

describe("proxy: rotas que não pertencem a tenant nenhum", () => {
  // Estas duas saem antes do findUnique de propósito. Pelo caminho normal
  // resolveriam o slug "default" e tomariam 404 — em silêncio, e no caso do
  // cron todo dia, até a primeira mensalidade faltar.
  it.each(["/api/cron/assinaturas", "/api/leads/publico"])(
    "%s passa sem resolver tenant",
    async (caminho) => {
      const res = await proxy(requisicao(caminho));

      expect(res.status).toBe(200);
      expect(findUnique).not.toHaveBeenCalled();
      // Sem x-tenant-id injetado: quem responde ali usa prismaUnscoped
      // conscientemente, em vez de herdar um escopo em silêncio.
      expect(tenantInjetado(res)).toBeNull();
    }
  );
});

describe("proxy: sessão de outro tenant não pode trancar o NextAuth", () => {
  // Cookie carregando um tenantId que não existe mais. Acontece sempre que um
  // tenant é recriado, e no desenvolvimento a cada reset do banco.
  const DE_OUTRO_TENANT: Sessao = {
    user: { id: "user-9", role: "ADMIN", tenantId: "tenant-que-nao-existe-mais" },
  };

  it("manda a navegação para o login quando a sessão é de outro tenant", async () => {
    comAssinatura(null);

    const res = await proxy(requisicao("/", DE_OUTRO_TENANT));

    expect(destino(res)).toBe(`http://${HOST}/login`);
  });

  it.each([
    "/api/auth/session",
    "/api/auth/callback/credentials",
    "/api/auth/csrf",
  ])("%s responde em vez de ser redirecionada", async (caminho) => {
    // Sem esta isenção o impasse é fechado: o SessionProvider pede
    // /api/auth/session, recebe o HTML do login e estoura ClientFetchError; o
    // signIn posta na callback e é redirecionado antes de chegar ao servidor.
    // Não há como trocar o cookie velho por um bom, e a única saída vira
    // limpar cookie na mão — coisa que cliente de restaurante não faz.
    //
    // O ramo da plataforma já isenta /api/platform/auth pelo mesmo motivo.
    comAssinatura(null);

    const res = await proxy(requisicao(caminho, DE_OUTRO_TENANT));

    expect(destino(res)).toBeNull();
    expect(res.status).toBe(200);
  });
});

describe("proxy: upload de logo funciona a partir da plataforma", () => {
  it("não reescreve POST /api/upload — bateria em /platform/api/upload, rota inexistente", async () => {
    vi.mocked(authPlatform).mockResolvedValue({
      user: { id: "admin-1" },
    } as never);

    const res = await proxy(requisicaoPlataforma("/api/upload", "POST"));

    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.status).not.toBe(404);
  });

  it("continua reescrevendo uma rota de página comum, ex. /leads", async () => {
    vi.mocked(authPlatform).mockResolvedValue({
      user: { id: "admin-1" },
    } as never);

    const res = await proxy(requisicaoPlataforma("/leads"));

    expect(res.headers.get("x-middleware-rewrite")).toContain("/platform/leads");
  });

  // authPlatform já volta null por padrão (beforeEach do arquivo), então esta
  // requisição chega sem sessão nenhuma — o caso de uma sessão de plataforma
  // expirada no meio do formulário de lead.
  it("POST /api/upload sem sessão responde 401 em JSON, não redireciona", async () => {
    const res = await proxy(requisicaoPlataforma("/api/upload", "POST"));

    expect(res.status).toBe(401);
    expect(destino(res)).toBeNull();
  });
});
