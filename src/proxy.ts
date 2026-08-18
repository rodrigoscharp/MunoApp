import { auth } from "@/lib/auth";
import { authPlatform } from "@/lib/auth-platform";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TENANT_PLANO_HEADER } from "@/lib/plans";

// Domínios raiz (sem subdomínio de tenant) conhecidos pela plataforma.
// Em dev, acessar localhost:3000 direto cai no tenant "default".
const ROOT_DOMAINS = (process.env.ROOT_DOMAIN ?? "localhost:3000").split(",");

// Subdomínio reservado da plataforma. Já consta em RESERVED_SLUGS
// (src/lib/tenant-provisioning.ts), então nenhum restaurante pode tomá-lo.
const PLATFORM_SUBDOMAIN = "admin";

// Rotas de /adm que a inadimplência NÃO fecha. O critério para entrar nesta
// lista é uma pergunta só: **algum cliente do restaurante sofre se isto for
// bloqueado?** Se sim, escapa.
//
// - /adm/assinatura é a página que resolve a pendência. Bloqueá-la manda o
//   dono em loop para longe da única tela que o desbloqueia.
// - /adm/orders e /adm/chats porque pedido que chegou e ninguém está olhando é
//   pedido perdido, e mensagem sem resposta é um cliente no vácuo. Isso não é
//   pressão sobre o dono: é dano colateral em quem nunca deveu nada.
//
// Do outro lado da linha fica gestão de verdade — cardápio, mesas, motoboys,
// pagamentos, cadastro do restaurante, e o que vier depois: o dono sente o
// bloqueio, o cliente dele não.
const ADM_LIVRE_DE_BLOQUEIO = ["/adm/assinatura", "/adm/orders", "/adm/chats"];

// Casa por segmento de caminho, e não por texto. Um startsWith cru liberaria
// qualquer rota futura que apenas comece igual: um /adm/ordersRelatorio (ou o
// /adm/assinaturas de um dia em que existam várias) entraria de carona numa
// lista que ninguém releu.
function escapaDoBloqueio(pathname: string): boolean {
  return ADM_LIVRE_DE_BLOQUEIO.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`)
  );
}

function resolveSlugFromHost(host: string): string | null {
  const hostname = host.split(":")[0];
  for (const root of ROOT_DOMAINS) {
    const rootHostname = root.split(":")[0];
    if (hostname === rootHostname) return null;
    if (hostname.endsWith(`.${rootHostname}`)) {
      return hostname.slice(0, hostname.length - rootHostname.length - 1);
    }
  }
  return null;
}

export default auth(async (req) => {
  const { nextUrl } = req;
  const session = req.auth;

  const host = req.headers.get("host") ?? "";
  const resolvedSlug = resolveSlugFromHost(host);

  // O wrapper auth() do NextAuth reescreve a origem de nextUrl para NEXTAUTH_URL
  // (reqWithEnvURL), então redirect/rewrite montados a partir dele saem para o
  // host errado — em produção, para fora do subdomínio do cliente.
  const hostname = host.split(":")[0];
  const protocolo =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1"
      ? "http"
      : "https";
  const urlNoHost = (caminho: string) =>
    new URL(caminho, `${protocolo}://${host}`);

  // A área de plataforma não pertence a nenhum tenant: não resolvemos tenant e
  // não injetamos x-tenant-id, o que obriga o código de lá a usar
  // prismaUnscoped conscientemente em vez de herdar um escopo em silêncio.
  if (resolvedSlug === PLATFORM_SUBDOMAIN) {
    const isPlatformLogin = nextUrl.pathname === "/platform/login";
    const isPlatformApi = nextUrl.pathname.startsWith("/api/platform");
    // Os endpoints do NextAuth da plataforma são o que sustenta o próprio
    // login: precisam responder sem sessão, exatamente como a tela de login.
    const isPlatformAuthApi = nextUrl.pathname.startsWith("/api/platform/auth");
    // Arquivo estático (a logo, um ícone, o bundle do Next). Precisa responder
    // sem sessão: senão a própria tela de login pede a imagem, leva um redirect
    // para si mesma e renderiza sem a marca.
    const isEstatico =
      nextUrl.pathname.startsWith("/_next/") ||
      /\.[a-z0-9]+$/i.test(nextUrl.pathname);
    // A rota de upload (src/app/api/upload/route.ts) não é exclusiva da
    // plataforma — tenant ADMIN também a usa — então ela não mora sob
    // /api/platform. Sem esta linha ela cairia no rewrite genérico abaixo e
    // viraria /platform/api/upload, rota inexistente: o botão de logo do
    // cadastro de lead (NovoLeadForm.tsx) responderia 500 em produção.
    const isApiUpload = nextUrl.pathname === "/api/upload";
    const platformSession = await authPlatform();

    // Checa user, e não só a sessão: o Auth.js pode devolver um objeto (de erro)
    // em vez de null, e aí `!platformSession` deixaria a requisição passar —
    // o layout e as rotas todas checam session?.user.
    if (
      !platformSession?.user &&
      !isPlatformLogin &&
      !isPlatformAuthApi &&
      !isEstatico
    ) {
      // Redirecionar uma chamada de API é pior que negá-la: o fetch segue o
      // redirect, recebe o HTML do login com status 200 e a UI comemora um
      // sucesso que nunca aconteceu. API responde 401 em JSON; só página vai
      // para o login. isApiUpload entra aqui pelo mesmo motivo: é API, não
      // página — mesmo fora de /api/platform.
      if (isPlatformApi || isApiUpload) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
      }
      return NextResponse.redirect(urlNoHost("/platform/login"));
    }
    if (platformSession?.user && isPlatformLogin) {
      return NextResponse.redirect(urlNoHost("/platform"));
    }

    // Reescreve admin.<root>/leads -> /platform/leads, mantendo a URL limpa
    // no navegador. Caminhos que já estão certos passam direto: /platform/*
    // (evita prefixar duas vezes) e /api/platform/* (que viraria
    // /platform/api/platform/... — rota inexistente, 404 em toda a API).
    // Estático também passa direto: reescrever /muno-marca.png para
    // /platform/muno-marca.png buscaria um arquivo que não existe.
    if (
      nextUrl.pathname.startsWith("/platform") ||
      isPlatformApi ||
      isApiUpload ||
      isEstatico
    ) {
      return NextResponse.next();
    }
    return NextResponse.rewrite(urlNoHost(`/platform${nextUrl.pathname}`));
  }

  const slug = resolvedSlug ?? "default";

  // /platform/* e /api/platform/* só existem sob o subdomínio da plataforma.
  // Sem isto, o CRM ficaria acessível pelo domínio de qualquer restaurante — e
  // a API cairia no pipeline do tenant, rodando com x-tenant-id injetado.
  if (
    nextUrl.pathname.startsWith("/platform") ||
    nextUrl.pathname.startsWith("/api/platform")
  ) {
    return new NextResponse(null, { status: 404 });
  }

  // Captura de lead da landing. Espelho da guarda logo acima, na direção
  // oposta: aquela nega o que é da plataforma quando vem de fora dela; esta
  // libera o que não pertence a tenant nenhum.
  //
  // Sair ANTES do findUnique é o ponto. Pelo caminho normal a rota resolveria
  // o slug "default" e morreria junto com o restaurante de demonstração no dia
  // em que ele for removido — em silêncio, com 404, sem ninguém relacionar uma
  // coisa à outra.
  //
  // Sem x-tenant-id injetado, o que obriga a rota a usar prismaUnscoped
  // conscientemente, como a área de plataforma.
  if (nextUrl.pathname === "/api/leads/publico") {
    return NextResponse.next();
  }

  // Cron da Vercel, pelo mesmo motivo e com a mesma consequência: o job dispara
  // contra o domínio do deploy, que não é subdomínio de restaurante nenhum.
  // Pelo caminho normal ele resolveria o slug "default" e tomaria 404 —
  // silencioso, todo dia às 9h UTC, até a primeira mensalidade faltar.
  //
  // Sem x-tenant-id injetado: quem cobra é a plataforma, e o job usa
  // prismaUnscoped conscientemente. A porta é o CRON_SECRET, não o proxy.
  if (nextUrl.pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    // A assinatura vem junto, na mesma consulta: o proxy roda em toda
    // requisição, e uma segunda ida ao banco por causa da cobrança sairia caro
    // em cada carregamento de cardápio.
    select: {
      id: true,
      status: true,
      plano: true,
      assinatura: { select: { status: true } },
    },
  });

  if (!tenant || tenant.status !== "active") {
    return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });
  }

  const isAdminRoute = nextUrl.pathname.startsWith("/adm");
  const isKitchenRoute = nextUrl.pathname.startsWith("/dashboard");
  const isAuthRoute =
    nextUrl.pathname === "/login" || nextUrl.pathname === "/register";

  // Os endpoints do NextAuth sustentam o próprio login e precisam responder
  // mesmo com uma sessão de outro tenant no cookie — exatamente como a tela de
  // login. A barra final evita casar com algo como /api/authorize.
  //
  // O ramo da plataforma já isenta /api/platform/auth pelo mesmo motivo; este
  // aqui não isentava, e o resultado era um impasse fechado: o SessionProvider
  // pedia /api/auth/session e recebia o HTML do login, o signIn era
  // redirecionado antes de chegar ao servidor, e não havia como trocar o
  // cookie velho por um bom. A única saída era limpar cookie na mão.
  const isAuthApi = nextUrl.pathname.startsWith("/api/auth/");

  // Sessão criada em outro subdomínio/tenant não é válida aqui (ex.: o tenant
  // foi recriado/resetado e o JWT antigo no navegador ainda referencia o id
  // velho). NÃO dá pra confiar em limpar o cookie aqui: o wrapper auth() do
  // NextAuth reemite o cookie de sessão (rolling session) na mesma resposta,
  // sobrescrevendo qualquer delete que a gente faça. Por isso tratamos uma
  // sessão com tenantId errado como "não logada" para fins de roteamento —
  // isso também impede que /login redirecione pra si mesmo (o mesmo `if`
  // bateria de novo lá) ou que o bounce pro "/" abaixo reabra o loop.
  const tenantMismatch = !!session && session.user.tenantId !== tenant.id;

  if (tenantMismatch && !isAuthRoute && !isAuthApi) {
    return NextResponse.redirect(urlNoHost("/login"));
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-tenant-id", tenant.id);
  requestHeaders.set(TENANT_PLANO_HEADER, tenant.plano);
  const forward = { request: { headers: requestHeaders } };

  // Redirect authenticated users away from auth pages
  if (isAuthRoute && session && !tenantMismatch) {
    return NextResponse.redirect(urlNoHost("/"));
  }

  // Admin routes: require ADMIN role
  if (isAdminRoute) {
    if (!session) {
      return NextResponse.redirect(urlNoHost("/login"));
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.redirect(urlNoHost("/"));
    }

    // Inadimplência bloqueia gestão, nunca operação. A checagem mora DENTRO de
    // isAdminRoute de propósito: cardápio, checkout, mesa, cozinha e motoboy
    // não têm como cair por causa de uma fatura — o código nem chega perto
    // deles. src/proxy.test.ts existe para manter isso verdadeiro.
    //
    // Só BLOQUEADA (15 dias de atraso) fecha a porta: INADIMPLENTE avisa na
    // tela e CANCELADA é a plataforma dizendo que o cliente não paga
    // mensalidade, não que ele está devendo. Tenant sem assinatura nenhuma
    // (implantação, cortesia, anterior à régua) também passa: ausência de
    // cobrança não é atraso, e o erro para o outro lado tranca o dono para
    // fora da própria gestão.
    //
    // Nem todo /adm é gestão: ADM_LIVRE_DE_BLOQUEIO guarda as telas em que
    // quem pagaria a conta seria o cliente do restaurante, e o porquê de cada
    // uma.
    const bloqueada = tenant.assinatura?.status === "BLOQUEADA";
    if (bloqueada && !escapaDoBloqueio(nextUrl.pathname)) {
      return NextResponse.redirect(urlNoHost("/adm/assinatura"));
    }
  }

  // Kitchen routes: require ADMIN or KITCHEN role
  if (isKitchenRoute) {
    if (!session) {
      return NextResponse.redirect(urlNoHost("/login"));
    }
    if (session.user.role !== "ADMIN" && session.user.role !== "KITCHEN") {
      return NextResponse.redirect(urlNoHost("/"));
    }
  }

  // Checkout de delivery/retirada exige conta. A comparação exata de path (com
  // a barra final tolerada) deixa /mesa/{token}/checkout de fora: pedido de
  // mesa não exige login.
  if (nextUrl.pathname.replace(/\/$/, "") === "/checkout" && !session) {
    return NextResponse.redirect(urlNoHost("/login?callbackUrl=/checkout"));
  }

  return NextResponse.next(forward);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
