/**
 * O que a Muno diz sobre IA, na landing e no README.
 *
 * O assistente de IA do cardápio foi removido (o filtro de restrições o
 * substituiu), e texto de venda que o anuncia seria publicidade de algo que não
 * existe. Este teste existe porque o README repetia a promessa em quatro
 * lugares que ninguém lembrou de procurar, e a landing tinha uma frase que
 * contradizia o aviso do próprio cardápio.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ler = (arquivo: string) => readFileSync(join(process.cwd(), arquivo), "utf8");

describe("nada anuncia o assistente de IA removido", () => {
  it.each(["public/vendas/index.html", "README.md"])("%s", (arquivo) => {
    const texto = ler(arquivo);

    expect(texto).not.toMatch(/\bIA\b/);
    expect(texto).not.toMatch(/groq/i);
    expect(texto).not.toMatch(/llama/i);
    expect(texto).not.toMatch(/assistente de ia/i);
  });
});

describe("a landing não contradiz o aviso do cardápio", () => {
  // O cardápio manda o cliente com alergia "confirmar com a equipe antes de
  // pedir". A landing não pode prometer ao dono que o cliente deixa de
  // perguntar: é o oposto da mensagem de segurança de que o filtro depende.
  it("não promete dispensar a conversa com o restaurante", () => {
    const landing = ler("public/vendas/index.html");

    expect(landing).not.toMatch(/sem perguntar/i);
    expect(landing).not.toMatch(/sem precisar perguntar/i);
  });
});
