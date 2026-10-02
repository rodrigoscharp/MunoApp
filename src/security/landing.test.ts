import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "../../public/vendas");
const PAGINAS = fs.readdirSync(RAIZ).filter((f) => f.endsWith(".html"));

/**
 * A landing é servida no mesmo domínio do /assinar, onde a pessoa digita CPF ou
 * CNPJ. Script de CDN de terceiro, sem versão fixa e sem SRI, executaria nessa
 * origem se o CDN fosse comprometido. Tudo que roda na página vem do próprio
 * domínio.
 */
describe("landing: nenhum script de terceiro", () => {
  it.each(PAGINAS)("%s só carrega script do próprio domínio", (pagina) => {
    const html = fs.readFileSync(path.join(RAIZ, pagina), "utf8");
    const externos = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
      .map((m) => m[1])
      .filter((src) => /^(https?:)?\/\//i.test(src));

    expect(externos).toEqual([]);
  });

  it("as bibliotecas servidas daqui existem e não estão vazias", () => {
    for (const arquivo of fs.readdirSync(path.join(RAIZ, "js/vendor")).filter((f) => f.endsWith(".js"))) {
      expect(fs.statSync(path.join(RAIZ, "js/vendor", arquivo)).size).toBeGreaterThan(10_000);
    }
  });

  it("todo script local referenciado existe", () => {
    const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
    const locais = [...html.matchAll(/<script[^>]+src=["'](\/vendas\/[^"']+)["']/gi)].map((m) => m[1]);
    for (const src of locais) {
      expect(fs.existsSync(path.resolve(RAIZ, "..", "." + src)), src).toBe(true);
    }
  });
});
