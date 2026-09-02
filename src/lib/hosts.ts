/**
 * Quem é o host da requisição.
 *
 * Esta é a ÚNICA implementação no repositório, e precisa continuar sendo.
 * `src/proxy.ts` importa daqui, e não tem cópia própria.
 *
 * O motivo está escrito com nome e data no AGENTS.md: existiu uma segunda
 * cópia da montagem de URL de tenant em `src/lib/tenant-url.ts` que usava a
 * PRIMEIRA entrada de ROOT_DOMAIN em vez da última. As duas divergiram em
 * silêncio, a rota de "esqueci minha senha" importava a errada, e o link de
 * recuperação saía com dois níveis de subdomínio, fora do certificado curinga.
 * Quem precisa saber de host importa deste módulo.
 */

// Domínios raiz (sem subdomínio de tenant) conhecidos pela plataforma. Eles
// servem a página de vendas, nunca um restaurante — inclusive em dev, onde o
// padrão localhost:3000 é raiz e o storefront do seed mora em
// default.localhost:3000.
export const ROOT_DOMAINS = (process.env.ROOT_DOMAIN ?? "localhost:3000").split(
  ","
);

// Subdomínio reservado da plataforma. Já consta em RESERVED_SLUGS
// (src/lib/tenant-provisioning.ts), então nenhum restaurante pode tomá-lo.
export const PLATFORM_SUBDOMAIN = "admin";

/** O slug do tenant no host, ou null quando o host é raiz. */
export function resolveSlugFromHost(host: string): string | null {
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

export type TipoDeHost = "plataforma" | "raiz" | "tenant";

/**
 * Os três produtos que este projeto serve, pelo host.
 *
 * "raiz" cobre tanto o apex (a landing) quanto qualquer host desconhecido,
 * porque `resolveSlugFromHost` devolve null nos dois. É o que faz o host de
 * deploy da Vercel se comportar como o apex em vez de virar um tenant.
 */
export function tipoDeHost(host: string): TipoDeHost {
  const slug = resolveSlugFromHost(host);
  if (slug === PLATFORM_SUBDOMAIN) return "plataforma";
  return slug === null ? "raiz" : "tenant";
}
