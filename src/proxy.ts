import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Domínios raiz (sem subdomínio de tenant) conhecidos pela plataforma.
// Em dev, acessar localhost:3000 direto cai no tenant "default".
const ROOT_DOMAINS = (process.env.ROOT_DOMAIN ?? "localhost:3000").split(",");

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
  const slug = resolveSlugFromHost(host) ?? "default";

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });

  if (!tenant || tenant.status !== "active") {
    return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });
  }

  // Sessão criada em outro subdomínio/tenant não é válida aqui.
  if (session && session.user.tenantId !== tenant.id) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-tenant-id", tenant.id);
  const forward = { request: { headers: requestHeaders } };

  const isAdminRoute = nextUrl.pathname.startsWith("/adm");
  const isKitchenRoute = nextUrl.pathname.startsWith("/dashboard");
  const isAuthRoute =
    nextUrl.pathname === "/login" || nextUrl.pathname === "/register";

  // Redirect authenticated users away from auth pages
  if (isAuthRoute && session) {
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

  return NextResponse.next(forward);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
