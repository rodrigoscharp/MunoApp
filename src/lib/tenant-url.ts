// Monta a URL base do painel de um tenant a partir do slug — usado sempre
// que um fluxo que não passa pelo subdomínio (email transacional, callback
// de OAuth) precisa gerar um link de volta pro painel do tenant certo.
export function buildTenantBaseUrl(slug: string): string {
  const rootDomain = (process.env.ROOT_DOMAIN ?? "localhost:3000").split(",")[0];
  if (slug === "default") {
    return process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_URL ?? `http://${rootDomain}`;
  }
  const protocol = rootDomain.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${slug}.${rootDomain}`;
}
