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
  it.each([
    "/api/cron/assinaturas",
    "/api/leads/publico",
    "/api/assinaturas/webhook/asaas",
  ])(
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

  // A porta de quem acabou de pagar. O e-mail de boas-vindas manda para
  // /redefinir-senha, e quem chega ali AINDA NÃO TEM SENHA. Redirecionar essa
  // pessoa para /login é trancá-la do lado de fora: a única porta que ela tem
  // passa a exigir justamente a credencial que ela veio criar. Basta ela já
  // ser dona de outro restaurante na Muno, ou ter um cookie de um tenant
  // recriado, para cair nisso.
  it.each(["/redefinir-senha", "/esqueci-senha"])(
    "%s responde mesmo com sessão de outro tenant",
    async (caminho) => {
      comAssinatura(null);

      const res = await proxy(requisicao(caminho, DE_OUTRO_TENANT));

      expect(destino(res)).toBeNull();
      expect(res.status).toBe(200);
    }
  );

  // E o contrário também precisa valer: quem ESTÁ logado neste tenant e pediu
  // troca de senha continua chegando na tela. /login e /register expulsam quem
  // já tem sessão; estas não podem, senão o link do e-mail vira um bounce para
  // a home no meio de uma troca de senha legítima.
  it.each(["/redefinir-senha", "/esqueci-senha"])(
    "%s não expulsa quem já está logado no próprio tenant",
    async (caminho) => {
      comAssinatura(null);

      const res = await proxy(
        requisicao(caminho, { user: { id: "u1", role: "ADMIN", tenantId: TENANT_ID } })
      );

      expect(destino(res)).toBeNull();
      expect(res.status).toBe(200);
    }
  );

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

  // A busca sobrevive ao rewrite. urlNoHost monta a URL a partir do caminho, e
  // esquecer nextUrl.search descarta toda query string do console em silêncio:
  // a tela de leads filtra por estágio pela URL e recebia sempre a lista
  // inteira, sem erro nenhum para denunciar o motivo.
  it("preserva a query string no rewrite da plataforma", async () => {
    vi.mocked(authPlatform).mockResolvedValue({
      user: { id: "admin-1" },
    } as never);

    const res = await proxy(requisicaoPlataforma("/leads?estagio=FECHADO"));

    expect(res.headers.get("x-middleware-rewrite")).toContain(
      "/platform/leads?estagio=FECHADO"
    );
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

describe("proxy: o domínio raiz serve a landing, nunca um restaurante", () => {
  // O ramo mais perigoso deste arquivo.
  //
  // Até 26/08/2026 o raiz não era servido por este projeto, e
  // `slug = resolvedSlug ?? "default"` era código morto — o spec de 10/08 o
  // descreve com essas palavras. Trazer a landing para cá ressuscita esse
  // ramo, e com ele o bug que 10/08 consertou: quem digita o endereço da
  // marca encontrar uma hamburgueria em Ubatuba e concluir que a Muno é isso.
  //
  // ROOT_DOMAIN não está definido no ambiente de teste, então o proxy usa o
  // padrão "localhost:3000" — que é domínio raiz, como o apex em produção.
  const RAIZ = "localhost:3000";

  function requisicaoRaiz(caminho: string, method = "GET"): NextRequest {
    const req = new NextRequest(`http://${RAIZ}${caminho}`, {
      headers: { host: RAIZ },
      method,
    });
    (req as unknown as { auth: Sessao }).auth = null;
    return req;
  }

  const reescritaPara = (res: Response) =>
    res.headers.get("x-middleware-rewrite");

  it("reescreve a home para o documento da landing", async () => {
    const res = await proxy(requisicaoRaiz("/"));

    expect(reescritaPara(res)).toContain("/vendas/index.html");
  });

  // A asserção que realmente protege. A do rewrite acima diz que a landing
  // aparece; esta diz que o tenant "default" não tem como aparecer — nem se
  // alguém, um dia, mexer no rewrite sem entender por que ele existe.
  it("não resolve tenant nenhum no raiz", async () => {
    await proxy(requisicaoRaiz("/"));

    expect(findUnique).not.toHaveBeenCalled();
  });

  // O caso que uma guarda descuidada deixa passar: tratar só a home e deixar
  // todo o resto cair no `?? "default"`. O sintoma é idêntico ao bug de 10/08,
  // só que num caminho em vez da home — e por isso ninguém repara.
  it.each(["/promocao", "/cart", "/adm", "/qualquer-coisa"])(
    "%s no raiz responde 404, e não o restaurante do seed",
    async (caminho) => {
      const res = await proxy(requisicaoRaiz(caminho));

      expect(res.status).toBe(404);
      expect(findUnique).not.toHaveBeenCalled();
    }
  );

  // Os assets da landing batem no proxy (o matcher não os exclui) e precisam
  // seguir para o filesystem. Sem isto a página abre sem CSS, sem a cena 3D e
  // sem os ícones — de pé, e visivelmente quebrada.
  it.each([
    "/vendas/css/styles.css",
    "/vendas/js/scene.js",
    "/vendas/img/logo.png",
  ])("%s segue para o filesystem, sem rewrite", async (caminho) => {
    const res = await proxy(requisicaoRaiz(caminho));

    expect(res.status).toBe(200);
    expect(reescritaPara(res)).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  // A landing agora é same-origin com o app, então o formulário dela posta
  // daqui. Um ramo de raiz colocado antes desta guarda mataria a captação de
  // lead em silêncio — o endpoint responderia 404 e o fetch da landing já
  // engole o erro de propósito.
  it("POST /api/leads/publico no raiz continua passando", async () => {
    const res = await proxy(requisicaoRaiz("/api/leads/publico", "POST"));

    expect(res.status).toBe(200);
    expect(reescritaPara(res)).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  const cookieDe = (res: Response) => res.headers.get("set-cookie") ?? "";

  // A sessão anônima nasce aqui, e só aqui. O proxy gera o id e devolve o
  // cookie; quem grava no banco é a rota de ingestão. Um write no middleware
  // custaria uma ida ao Postgres em toda requisição de todo cardápio.
  it("planta o cookie de sessão na home do raiz", async () => {
    const res = await proxy(requisicaoRaiz("/"));

    expect(cookieDe(res)).toMatch(/muno_s=[0-9a-f-]{36}/);
    expect(cookieDe(res)).toContain("HttpOnly");
    expect(cookieDe(res)).toMatch(/samesite=lax/i);
    expect(cookieDe(res)).toContain("Max-Age=31536000");
    expect(cookieDe(res)).toContain("Path=/");
  });

  // O checkout é o outro lado do mesmo funil e mora no mesmo host. Quem chega
  // de um anúncio direto em /assinar precisa de sessão igual.
  it("planta o cookie em /assinar", async () => {
    const res = await proxy(requisicaoRaiz("/assinar"));

    expect(cookieDe(res)).toMatch(/muno_s=/);
  });

  // Reescrever o valor a cada visita mataria a sessão e transformaria um
  // visitante recorrente em vários, deflacionando toda taxa de conversão.
  it("não reescreve o cookie que já veio na requisição", async () => {
    // O cookie vai no construtor, e não num headers.set() depois: o
    // NextRequest parseia os cookies na construção, e mutar o header adiante
    // deixaria req.cookies vazio — o teste passaria por engano, afirmando o
    // contrário do que quer afirmar.
    const req = new NextRequest(`http://${RAIZ}/`, {
      headers: { host: RAIZ, cookie: "muno_s=ja-existente" },
    });
    (req as unknown as { auth: Sessao }).auth = null;

    const res = await proxy(req);

    expect(cookieDe(res)).not.toContain("muno_s=");
  });

  // É por isso que o cookie não tem atributo Domain. Em .munoapp.com.br ele
  // viajaria em toda requisição de todo cardápio de todo restaurante. O caso
  // de "/assinar" é o que importa de verdade: é o único ponto de plantio que
  // um host de tenant alcança, já que "/" num host de tenant nunca passa perto
  // de comSessao — segue direto para a resolução do tenant.
  it.each(["/", "/assinar"])(
    "não planta cookie nenhum em host de restaurante (%s)",
    async (caminho) => {
      const res = await proxy(requisicao(caminho));

      expect(cookieDe(res)).not.toContain("muno_s=");
    }
  );

  // Mesma guarda, mesma posição e mesmo motivo de /api/leads/publico: sem ela
  // o raiz responde 404 e o painel fica vazio, com o fetch da landing engolindo
  // o erro de propósito.
  it("POST /api/funil/evento no raiz passa, sem resolver tenant", async () => {
    const res = await proxy(requisicaoRaiz("/api/funil/evento", "POST"));

    expect(res.status).toBe(200);
    expect(findUnique).not.toHaveBeenCalled();
  });

  // O espelho da guarda: a landing existe em public/, que responde em
  // qualquer host. Sem isto, a página de vendas da Muno abre dentro do
  // domínio do cliente e o Google a indexa em quantos subdomínios existirem.
  it.each(["/vendas/index.html", "/vendas/css/styles.css"])(
    "%s em host de restaurante responde 404",
    async (caminho) => {
      const res = await proxy(requisicao(caminho));

      expect(res.status).toBe(404);
    }
  );

  it("host de restaurante segue resolvendo o tenant, intacto", async () => {
    const res = await proxy(requisicao("/"));

    expect(findUnique).toHaveBeenCalled();
    expect(tenantInjetado(res)).toBe(TENANT_ID);
  });

  // O checkout público (/assinar e /api/assinar/*) não pertence a tenant
  // nenhum, e é para o raiz que a landing manda o botão de assinar. Sem uma
  // guarda igual à de /api/leads/publico, esta rota cai no mesmo 404 do teste
  // acima — a página existiria e ninguém a alcançaria.
  it.each(["/assinar", "/assinar/obrigado", "/api/assinar", "/api/assinar/slug"])(
    "%s responde no domínio raiz, onde não existe tenant",
    async (caminho) => {
      const res = await proxy(requisicaoRaiz(caminho));

      expect(res.status).toBe(200);
      expect(findUnique).not.toHaveBeenCalled();
    }
  );
});

describe("proxy: os arquivos do PWA respondem nos quatro hosts", () => {
  // O manifest, o service worker e a página de offline precisam responder em
  // TODO host, porque cada subdomínio é uma origem instalável separada. O
  // risco mora no domínio raiz: lá qualquer caminho que não seja "/" leva 404
  // de propósito, e é só a extensão do arquivo que faz isEstatico() deixar
  // passar antes daquela guarda.
  //
  // O sintoma de uma regressão aqui é silencioso nos três casos. Manifest com
  // 404: o navegador simplesmente deixa de oferecer a instalação. Service
  // worker com 404: o registro falha dentro de um catch vazio. Offline com
  // 404: só aparece no dia em que alguém perde a rede.
  const RAIZ = "localhost:3000";

  function requisicaoRaiz(caminho: string): NextRequest {
    const req = new NextRequest(`http://${RAIZ}${caminho}`, {
      headers: { host: RAIZ },
    });
    (req as unknown as { auth: Sessao }).auth = null;
    return req;
  }

  const ARQUIVOS = ["/manifest.webmanifest", "/sw.js", "/offline.html"];

  it.each(ARQUIVOS)("%s responde no domínio raiz, sem resolver tenant", async (caminho) => {
    const res = await proxy(requisicaoRaiz(caminho));

    expect(res.status).toBe(200);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each(ARQUIVOS)("%s responde no host do restaurante", async (caminho) => {
    const res = await proxy(requisicao(caminho));

    expect(res.status).toBe(200);
    expect(destino(res)).toBeNull();
  });

  // O manifest é dinâmico e lê x-tenant-id para saber de quem é o nome do app.
  // Sem o header injetado ele cai para "Muno", e o cliente do restaurante
  // instala um atalho com o nome da plataforma.
  it("o manifest recebe o x-tenant-id no host do restaurante", async () => {
    const res = await proxy(requisicao("/manifest.webmanifest"));

    expect(tenantInjetado(res)).toBe(TENANT_ID);
  });

  it.each(ARQUIVOS)(
    "%s responde em admin. sem exigir sessão de plataforma",
    async (caminho) => {
      // Sem sessão: authPlatform devolve null no beforeEach. Se estes arquivos
      // não contassem como estáticos, o console redirecionaria o pedido do
      // manifest para /platform/login e o CRM nunca seria instalável.
      const res = await proxy(requisicaoPlataforma(caminho));

      expect(res.status).toBe(200);
      expect(destino(res)).toBeNull();
    }
  );

  // Espelho da guarda de /vendas/: o service worker controla a origem inteira,
  // e um escopo maior que o pretendido seria concedido por um arquivo servido
  // de onde não devia.
  it("o sw.js do host do restaurante não é reescrito para lugar nenhum", async () => {
    const res = await proxy(requisicao("/sw.js"));

    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
