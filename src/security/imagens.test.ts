import { describe, expect, it, vi, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function carregar(url: string | undefined) {
  if (url === undefined) vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  else vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  const caminho = require.resolve("../../next.config.js");
  delete require.cache[caminho];
  return require(caminho) as {
    images: { remotePatterns: { protocol: string; hostname: string; pathname?: string }[] };
  };
}

afterEach(() => vi.unstubAllEnvs());

/**
 * `/_next/image?url=` otimiza qualquer host liberado em remotePatterns, na cota
 * de otimização da Muno. Com "**.supabase.co", isso valia para o projeto
 * Supabase de qualquer pessoa.
 */
describe("imagens remotas do next.config.js", () => {
  it("libera só o projeto do app e só o bucket de imagens do cardápio", () => {
    const { remotePatterns } = carregar("https://abcdefgh.supabase.co").images;
    expect(remotePatterns).toEqual([
      {
        protocol: "https",
        hostname: "abcdefgh.supabase.co",
        pathname: "/storage/v1/object/public/product-images/**",
      },
    ]);
  });

  it("não libera nenhum curinga quando o projeto é conhecido", () => {
    const { remotePatterns } = carregar("https://abcdefgh.supabase.co").images;
    expect(remotePatterns.some((p) => p.hostname.includes("*"))).toBe(false);
  });

  it("sem a variável (desenvolvimento sem .env) mantém o curinga antigo, para a imagem não quebrar", () => {
    const { remotePatterns } = carregar(undefined).images;
    expect(remotePatterns.map((p) => p.hostname)).toContain("**.supabase.co");
  });

  it("URL inválida também cai no curinga, em vez de derrubar o build", () => {
    const { remotePatterns } = carregar("isto-nao-e-uma-url").images;
    expect(remotePatterns.length).toBeGreaterThan(0);
  });
});
