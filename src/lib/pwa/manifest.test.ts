import { describe, it, expect } from "vitest";
import { montarManifest, nomeCurto } from "./manifest";

describe("nomeCurto", () => {
  it("devolve o nome inteiro quando ele já cabe", () => {
    expect(nomeCurto("Bar do Zé")).toBe("Bar do Zé");
  });

  it("cai para a primeira palavra quando o nome é longo", () => {
    expect(nomeCurto("Hamburgueria do Seu Zé Ubatuba")).toBe("Hamburgueria");
    // 13 caracteres já não cabem: o aparelho cortaria com reticências.
    expect(nomeCurto("Pizzaria Nona")).toBe("Pizzaria");
  });

  it("corta a primeira palavra quando nem ela cabe", () => {
    expect(nomeCurto("Supercalifragilisticexpialidocious Lanches")).toBe(
      "Supercalifra"
    );
  });

  it("ignora espaço em volta", () => {
    expect(nomeCurto("  Bar do Zé  ")).toBe("Bar do Zé");
  });
});

describe("montarManifest", () => {
  it("usa a marca da plataforma quando não há restaurante", () => {
    const m = montarManifest(null);
    expect(m.name).toBe("Muno");
    expect(m.short_name).toBe("Muno");
  });

  it("usa o nome do restaurante no subdomínio dele", () => {
    const m = montarManifest("Pizzaria Nona");
    expect(m.name).toBe("Pizzaria Nona");
    expect(m.short_name).toBe("Pizzaria");
    expect(m.description).toContain("Pizzaria Nona");
  });

  it("cai para a marca quando o nome do restaurante está vazio", () => {
    // getRestaurantInfo devolve name: "" quando o Tenant não tem nome. Um
    // manifest com name vazio faz o Chrome recusar a instalação em silêncio.
    expect(montarManifest("").name).toBe("Muno");
    expect(montarManifest("   ").name).toBe("Muno");
  });

  it("mantém os campos que decidem a instalabilidade", () => {
    const m = montarManifest("Pizzaria Nona");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.orientation).toBe("portrait");
    expect(m.lang).toBe("pt-BR");
    expect(m.background_color).toBe("#F5F2EE");
    expect(m.theme_color).toBe("#D4612A");
  });

  it("declara 192, 512 e uma maskable de 512", () => {
    const icones = montarManifest(null).icons ?? [];
    const chave = icones.map((i) => `${i.sizes}:${i.purpose ?? "any"}`);
    expect(chave).toContain("192x192:any");
    expect(chave).toContain("512x512:any");
    expect(chave).toContain("512x512:maskable");
  });

  it("aponta os ícones para caminhos absolutos", () => {
    // O manifest é servido em /manifest.webmanifest, na raiz, mas o caminho
    // relativo resolveria contra a URL do manifest em vez da origem.
    for (const icone of montarManifest(null).icons ?? []) {
      expect(icone.src.startsWith("/")).toBe(true);
    }
  });
});

describe("montarManifest: de quem é o ícone", () => {
  const LOGO = "https://abc.supabase.co/storage/v1/object/public/x/logo.png";

  it("sem logo cadastrado, usa os ícones da Muno", () => {
    // É o que mantém o tenant "default", cujo logoUrl é o padrão, com a marca
    // da plataforma.
    for (const semLogo of [null, undefined, "", "/munowbg.png"]) {
      const icones = montarManifest("Muno Food", semLogo).icons ?? [];
      expect(icones.every((i) => i.src.startsWith("/icons/"))).toBe(true);
    }
  });

  it("com logo cadastrado, aponta para a rota do restaurante", () => {
    const icones = montarManifest("Pizzaria Nona", LOGO).icons ?? [];
    expect(icones.every((i) => i.src.startsWith("/icone/"))).toBe(true);
    const chave = icones.map((i) => `${i.sizes}:${i.purpose ?? "any"}`);
    expect(chave).toContain("192x192:any");
    expect(chave).toContain("512x512:any");
    expect(chave).toContain("512x512:maskable");
  });

  it("carimba a versão do logo na URL", () => {
    // O Cache-Control da rota é `immutable`. Sem este carimbo, quem trocasse
    // de logo ficaria preso ao antigo no navegador de todo mundo, por um ano.
    const antes = montarManifest("Pizzaria", LOGO).icons ?? [];
    const depois = montarManifest("Pizzaria", LOGO + "?2").icons ?? [];
    expect(antes[0].src).toMatch(/\?v=[a-z0-9]+$/);
    expect(antes[0].src).not.toBe(depois[0].src);
  });

  it("a versão é estável para o mesmo logo", () => {
    // Instável, ela invalidaria a CDN a cada request e o cache imutável não
    // valeria nada.
    expect(montarManifest("X", LOGO).icons?.[0].src).toBe(
      montarManifest("X", LOGO).icons?.[0].src
    );
  });

  it("logo fora da allowlist cai nos ícones da Muno", () => {
    // A rota também recusaria, mas anunciar no manifest um ícone que sempre
    // redireciona é gastar uma ida à rede em cada instalação.
    const icones = montarManifest("X", "https://evil.com/logo.png").icons ?? [];
    expect(icones.every((i) => i.src.startsWith("/icons/"))).toBe(true);
  });
});
