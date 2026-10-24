import { afterEach, describe, expect, it, vi } from "vitest";
import { imagemOtimizavel } from "./imagem-otimizavel";

afterEach(() => vi.unstubAllEnvs());

const BUCKET = "https://abcdefgh.supabase.co/storage/v1/object/public/product-images";

describe("imagemOtimizavel", () => {
  it("arquivo de public/ sempre passa pelo otimizador", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefgh.supabase.co");
    expect(imagemOtimizavel("/munowbg.png")).toBe(true);
  });

  it("aceita o bucket do projeto, onde o /api/upload grava produto e logo", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefgh.supabase.co");
    expect(imagemOtimizavel(`${BUCKET}/tenant-1/123.webp`)).toBe(true);
  });

  // O next.config.js só libera esse caminho: qualquer outro o /_next/image
  // recusa com 400, e a imagem quebraria se não caísse no unoptimized.
  it("recusa outro bucket, outro projeto e outro site", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefgh.supabase.co");
    expect(
      imagemOtimizavel("https://abcdefgh.supabase.co/storage/v1/object/public/outro/x.png")
    ).toBe(false);
    expect(
      imagemOtimizavel("https://zzzz.supabase.co/storage/v1/object/public/product-images/x.png")
    ).toBe(false);
    expect(imagemOtimizavel("https://exemplo.com/logo.png")).toBe(false);
    expect(imagemOtimizavel("//exemplo.com/logo.png")).toBe(false);
    expect(imagemOtimizavel("isto não é url")).toBe(false);
  });

  it("sem a variável segue o curinga do next.config.js", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(imagemOtimizavel("https://qualquer.supabase.co/a.png")).toBe(true);
    expect(imagemOtimizavel("https://exemplo.com/logo.png")).toBe(false);
  });
});
