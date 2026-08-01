import { auth } from "@/lib/auth";
import { authPlatform } from "@/lib/auth-platform";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Domínios raiz (sem subdomínio de tenant) conhecidos pela plataforma.
// Em dev, acessar localhost:3000 direto cai no tenant "default".
const ROOT_DOMAINS = (process.env.ROOT_DOMAIN ?? "localhost:3000").split(",");

// Subdomínio reservado da plataforma. Já consta em RESERVED_SLUGS
// (src/lib/tenant-provisioning.ts), então nenhum restaurante pode tomá-lo.
const PLATFORM_SUBDOMAIN = "admin";

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

  // A área de plataforma não pertence a nenhum tenant: não resolvemos tenant e
  // não injetamos x-tenant-id, o que obriga o código de lá a usar
  // prismaUnscoped conscientemente em vez de herdar um escopo em silêncio.
  if (resolvedSlug === PLATFORM_SUBDOMAIN) {
    const isPlatformLogin = nextUrl.pathname === "/platform/login";
    const platformSession = await authPlatform();

    if (!platformSession && !isPlatformLogin) {
      return NextResponse.redirect(new URL("/platform/login", nextUrl));
    }
    if (platformSession && isPlatformLogin) {
      return NextResponse.redirect(new URL("/platform", nextUrl));
    }

    // Reescreve admin.<root>/leads -> /platform/leads, mantendo a URL limpa
    // no navegador. Evita prefixar duas vezes quando já veio reescrito.
    if (nextUrl.pathname.startsWith("/platform")) {
      return NextResponse.next();
    }
    return NextResponse.rewrite(
      new URL(`/platform${nextUrl.pathname}`, nextUrl)
    );
  }

  const slug = resolvedSlug ?? "default";

  // /platform/* só existe sob o subdomínio da plataforma. Sem isto, o CRM
  // ficaria acessível pelo domínio de qualquer restaurante.
  if (nextUrl.pathname.startsWith("/platform")) {
    return new NextResponse(null, { status: 404 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });

  if (!tenant || tenant.status !== "active") {
    return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });
  }

  const isAdminRoute = nextUrl.pathname.startsWith("/adm");
  const isKitchenRoute = nextUrl.pathname.startsWith("/dashboard");
  const isAuthRoute =
    nextUrl.pathname === "/login" || nextUrl.pathname === "/register";

  // Sessão criada em outro subdomínio/tenant não é válida aqui (ex.: o tenant
  // foi recriado/resetado e o JWT antigo no navegador ainda referencia o id
  // velho). NÃO dá pra confiar em limpar o cookie aqui: o wrapper auth() do
  // NextAuth reemite o cookie de sessão (rolling session) na mesma resposta,
  // sobrescrevendo qualquer delete que a gente faça. Por isso tratamos uma
  // sessão com tenantId errado como "não logada" para fins de roteamento —
  // isso também impede que /login redirecione pra si mesmo (o mesmo `if`
  // bateria de novo lá) ou que o bounce pro "/" abaixo reabra o loop.
  const tenantMismatch = !!session && session.user.tenantId !== tenant.id;

  if (tenantMismatch && !isAuthRoute) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-tenant-id", tenant.id);
  const forward = { request: { headers: requestHeaders } };

  // Redirect authenticated users away from auth pages
  if (isAuthRoute && session && !tenantMismatch) {
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  // Admin routes: require ADMIN role
  if (isAdminRoute) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", nextUrl));
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", nextUrl));
    }
  }

  // Kitchen routes: require ADMIN or KITCHEN role
  if (isKitchenRoute) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", nextUrl));
    }
    if (session.user.role !== "ADMIN" && session.user.role !== "KITCHEN") {
      return NextResponse.redirect(new URL("/", nextUrl));
    }
  }

  // Checkout de delivery/retirada exige conta. A comparação exata de path (com
  // a barra final tolerada) deixa /mesa/{token}/checkout de fora: pedido de
  // mesa não exige login.
  if (nextUrl.pathname.replace(/\/$/, "") === "/checkout" && !session) {
    return NextResponse.redirect(new URL("/login?callbackUrl=/checkout", nextUrl));
  }

  return NextResponse.next(forward);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
