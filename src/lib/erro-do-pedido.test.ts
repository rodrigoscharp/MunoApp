/**
 * O que o cliente lê quando o pedido não passa.
 *
 * O checkout mostrava `JSON.stringify(errBody.error)`: num 400 de validação,
 * o cliente via um array de issues do zod, em inglês, com chaves e colchetes.
 * Aqui se afirma que nenhuma resposta do servidor vira texto técnico na tela.
 */

import { describe, expect, it } from "vitest";
import { avisoDeIndisponiveis, lerErroDoPedido } from "./erro-do-pedido";

describe("lerErroDoPedido", () => {
  it("mensagem em texto passa como veio", () => {
    expect(lerErroDoPedido({ error: "O restaurante está fechado no momento." })).toEqual({
      mensagem: "O restaurante está fechado no momento.",
      campos: {},
      indisponiveis: [],
    });
  });

  it("issues do zod viram erro no campo, em português, sem JSON", () => {
    const erro = lerErroDoPedido({
      error: [
        { path: ["customerPhone"], message: "Telefone é obrigatório para entrega", code: "custom" },
        { path: ["customerName"], message: "Too big: expected string to have <=100 characters", code: "too_big" },
      ],
    });

    expect(erro.campos.customerPhone).toBe("Confira o telefone.");
    expect(erro.campos.customerName).toBe("Confira o nome.");
    expect(erro.mensagem).toBe("Confira os campos destacados.");
    expect(erro.mensagem).not.toMatch(/[[{]/);
  });

  it("issue de campo que o formulário não mostra vira mensagem geral legível", () => {
    const erro = lerErroDoPedido({ error: [{ path: ["items", 0, "quantity"], message: "Too big" }] });

    expect(erro.campos).toEqual({});
    expect(erro.mensagem).toMatch(/não conseguimos enviar o pedido/i);
    expect(erro.mensagem).not.toMatch(/too big/i);
  });

  it("devolve os itens indisponíveis que o servidor apontou", () => {
    const erro = lerErroDoPedido({
      error: "Um ou mais itens do carrinho não estão mais disponíveis.",
      indisponiveis: ["item-1", "item-2"],
    });
    expect(erro.indisponiveis).toEqual(["item-1", "item-2"]);
  });

  it("ignora indisponiveis que não seja lista de texto", () => {
    expect(lerErroDoPedido({ error: "x", indisponiveis: "item-1" }).indisponiveis).toEqual([]);
    expect(lerErroDoPedido({ error: "x", indisponiveis: [1, "a"] }).indisponiveis).toEqual(["a"]);
  });

  it.each([undefined, null, {}, "texto solto", { error: { code: 1 } }])(
    "corpo inesperado (%j) vira mensagem genérica",
    (corpo) => {
      expect(lerErroDoPedido(corpo).mensagem).toMatch(/não conseguimos enviar o pedido/i);
    }
  );
});

describe("avisoDeIndisponiveis", () => {
  it("nomeia o item no singular e a lista no plural", () => {
    expect(avisoDeIndisponiveis(["X-Salada"])).toMatch(/^X-Salada não está mais disponível/);
    expect(avisoDeIndisponiveis(["X-Salada", "Suco", "Pudim"])).toMatch(
      /^X-Salada, Suco e Pudim não estão mais disponíveis/
    );
  });

  it("sem item, sem aviso", () => {
    expect(avisoDeIndisponiveis([])).toBe("");
  });
});
