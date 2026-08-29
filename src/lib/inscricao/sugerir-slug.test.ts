import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sugerirSlug } from "@/lib/inscricao/sugerir-slug";

describe("sugerirSlug", () => {
  it("remove acentos em vez de trocá-los por hífen", () => {
    expect(sugerirSlug("Açaí São João")).toBe("acai-sao-joao");
  });

  it("baixa a caixa", () => {
    expect(sugerirSlug("PIZZARIA")).toBe("pizzaria");
  });

  it("colapsa pontuação e espaços seguidos num hífen só", () => {
    expect(sugerirSlug("Bar  do   Zé & Cia.")).toBe("bar-do-ze-cia");
  });

  it("não deixa hífen nas pontas", () => {
    expect(sugerirSlug("  ...Pizzaria!!!  ")).toBe("pizzaria");
  });

  it("preserva número, que é parte legítima de nome de restaurante", () => {
    expect(sugerirSlug("Boteco 442")).toBe("boteco-442");
  });

  // Nome inteiro fora do alfabeto (ex.: só emoji ou só ideogramas) vira string
  // vazia — e é o certo. Quem chama precisa tratar: checarSlug recusa vazio
  // como INVALIDO, então o cliente vê o erro em vez de reservar um endereço
  // impossível.
  it("devolve string vazia quando não sobra nenhum caractere aproveitável", () => {
    expect(sugerirSlug("🍕🍕🍕")).toBe("");
  });
});

// Este arquivo já derrubou o build de produção inteiro. Ele é importado por
// dois Client Components (ConverterLead e FormularioAssinatura), e enquanto
// `sugerirSlug` morava em slug.ts, importar só ela bastava para o bundler
// seguir a cadeia até `node:async_hooks` — esquema que o webpack não sabe
// empacotar para o navegador. Ver o docblock do módulo.
//
// O teste lê o próprio arquivo em vez de checar comportamento porque o dano
// não aparece em runtime: aparece no `next build`, depois do merge. Uma
// asserção sobre a fonte é o único jeito de pegar isso na suíte.
describe("sugerir-slug.ts é um módulo puro", () => {
  const fonte = readFileSync(
    new URL("./sugerir-slug.ts", import.meta.url),
    "utf8"
  );

  it("não tem nenhum import — nem de tipo", () => {
    const imports = fonte
      .split("\n")
      .filter((linha) => /^\s*import\b/.test(linha));

    expect(imports).toEqual([]);
  });

  it("não tem require nem import dinâmico", () => {
    expect(fonte).not.toMatch(/\brequire\s*\(/);
    expect(fonte).not.toMatch(/\bimport\s*\(/);
  });
});
