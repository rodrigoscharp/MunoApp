import { describe, expect, it } from "vitest";
import { normalizarLinkDeAvaliacao } from "./avaliacao-google";
import { restaurantInfoSchema } from "./restaurant";

describe("normalizarLinkDeAvaliacao", () => {
  it("aceita as formas que o Perfil da Empresa entrega", () => {
    expect(normalizarLinkDeAvaliacao("https://g.page/r/CbXyZ123/review")).toBe("https://g.page/r/CbXyZ123/review");
    expect(normalizarLinkDeAvaliacao("https://search.google.com/local/writereview?placeid=ChIJ123")).toBe(
      "https://search.google.com/local/writereview?placeid=ChIJ123"
    );
    expect(normalizarLinkDeAvaliacao("https://maps.app.goo.gl/AbC123")).toBe("https://maps.app.goo.gl/AbC123");
    expect(normalizarLinkDeAvaliacao("https://www.google.com.br/maps/place/x")).toBe("https://www.google.com.br/maps/place/x");
  });

  it("completa o https de quem colou sem ele", () => {
    expect(normalizarLinkDeAvaliacao("  g.page/r/CbXyZ123/review ")).toBe("https://g.page/r/CbXyZ123/review");
  });

  it("recusa endereço que não é do Google", () => {
    expect(normalizarLinkDeAvaliacao("https://google.com.golpe.net/review")).toBeNull();
    expect(normalizarLinkDeAvaliacao("https://notgoogle.com/review")).toBeNull();
    expect(normalizarLinkDeAvaliacao("https://exemplo.com/?r=g.page")).toBeNull();
  });

  it("recusa http, javascript: e credencial embutida", () => {
    expect(normalizarLinkDeAvaliacao("http://g.page/r/x/review")).toBeNull();
    expect(normalizarLinkDeAvaliacao("javascript:alert(1)")).toBeNull();
    expect(normalizarLinkDeAvaliacao("https://x@g.page/r/x/review")).toBeNull();
  });

  it("vazio é ausência, não erro", () => {
    expect(normalizarLinkDeAvaliacao("")).toBeNull();
    expect(normalizarLinkDeAvaliacao("   ")).toBeNull();
  });
});

describe("restaurantInfoSchema.avaliacaoGoogleUrl", () => {
  it("é opcional e grava o link normalizado", () => {
    expect(restaurantInfoSchema.parse({ name: "X" }).avaliacaoGoogleUrl).toBe("");
    expect(restaurantInfoSchema.parse({ name: "X", avaliacaoGoogleUrl: "g.page/r/abc/review" }).avaliacaoGoogleUrl).toBe(
      "https://g.page/r/abc/review"
    );
  });

  it("recusa link de fora do Google", () => {
    expect(restaurantInfoSchema.safeParse({ name: "X", avaliacaoGoogleUrl: "https://golpe.net" }).success).toBe(false);
  });
});
