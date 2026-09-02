import { describe, it, expect } from "vitest";
import { origemDoLogo, LOGO_PADRAO } from "./logo-do-tenant";

describe("origemDoLogo", () => {
  it("aceita o storage do Supabase, que é para onde /api/upload manda", () => {
    expect(
      origemDoLogo("https://abc.supabase.co/storage/v1/object/public/x/logo.png")
    ).toBe("remoto");
    expect(origemDoLogo("https://abc.supabase.com/storage/logo.webp")).toBe(
      "remoto"
    );
  });

  it("aceita caminho relativo de imagem, servido pela própria origem", () => {
    expect(origemDoLogo("/uploads/logo.png")).toBe("relativo");
    expect(origemDoLogo("/marcas/pizzaria.webp")).toBe("relativo");
    // "/munowbg.png" NÃO entra aqui: ele é o LOGO_PADRAO, coberto abaixo.
  });

  it("recusa o logo padrão, que não é logo de ninguém", () => {
    // Não é segurança, é semântica: quem está com o padrão não cadastrou logo,
    // e o ícone dele tem que ser o da Muno.
    expect(origemDoLogo(LOGO_PADRAO)).toBe(null);
    expect(origemDoLogo("")).toBe(null);
    expect(origemDoLogo("   ")).toBe(null);
  });

  // O núcleo desta função. logoUrl é z.string() sem validação nenhuma, e quem
  // grava é o dono do restaurante pelo admin: hoje o valor só vira src de uma
  // <img> no navegador de quem visita, mas a rota de ícone o busca DO SERVIDOR.
  describe("recusa o que transformaria o ícone em SSRF", () => {
    it.each([
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:3000/api/orders",
      "http://127.0.0.1/admin",
      "https://10.0.0.5/interno.png",
      "https://evil.com/logo.png",
      "https://evil.com/logo.png#.supabase.co",
      // host que só TERMINA parecido
      "https://evil-supabase.co/logo.png",
      // subdomínio do atacante com o nosso host no meio
      "https://abc.supabase.co.evil.com/logo.png",
      // credenciais no host, truque clássico para confundir parser ingênuo
      "https://abc.supabase.co@evil.com/logo.png",
      // protocolo-relativo: começa com barra e NÃO é caminho da nossa origem
      "//evil.com/logo.png",
      "file:///etc/passwd",
      "data:image/png;base64,AAAA",
      "gopher://interno:70/x",
    ])("%s", (url) => {
      expect(origemDoLogo(url)).toBe(null);
    });

    it("recusa http mesmo em host permitido", () => {
      // Sem TLS a resposta é interceptável, e um ícone não vale abrir isso.
      expect(origemDoLogo("http://abc.supabase.co/logo.png")).toBe(null);
    });
  });

  it("recusa caminho relativo que não é imagem", () => {
    // Sem isto, logoUrl = "/api/orders" faria a rota buscar a própria API e
    // jogar a resposta no sharp. Ele recusaria, mas a requisição já teria sido
    // feita, com o cookie de ninguém e por conta do servidor.
    expect(origemDoLogo("/api/orders")).toBe(null);
    expect(origemDoLogo("/adm")).toBe(null);
  });
});
