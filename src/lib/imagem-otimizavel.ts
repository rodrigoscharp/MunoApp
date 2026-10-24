/**
 * Se o /_next/image aceita esta URL, ou se a imagem precisa de `unoptimized`.
 *
 * Espelha `remotePatternsDasImagens()` do `next.config.js`: com o projeto
 * Supabase conhecido, só o bucket `product-images` dele (é para lá que o
 * `/api/upload` manda produto e logo); sem a variável, o curinga antigo.
 * Caminho relativo é arquivo de `public/` e sempre passa.
 *
 * Qualquer outra URL (um logo colado à mão de outro site, por exemplo) seria
 * recusada pelo otimizador com 400 e a imagem sumiria da tela. Para essas o
 * componente cai no `unoptimized`, que serve o original: pesa mais, mas não
 * quebra. Se o next.config.js mudar, esta função muda junto.
 */
export function imagemOtimizavel(src: string): boolean {
  if (src.startsWith("/") && !src.startsWith("//")) return true;

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  let hostDoProjeto = "";
  try {
    hostDoProjeto = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    // sem a variável: vale o curinga, como no next.config.js
  }

  if (hostDoProjeto) {
    return (
      url.hostname === hostDoProjeto &&
      url.pathname.startsWith("/storage/v1/object/public/product-images/")
    );
  }
  return url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".supabase.com");
}
