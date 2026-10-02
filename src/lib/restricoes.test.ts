/**
 * O que passa em cada filtro, e a conversão do tri-estado do formulário.
 *
 * A regra que segura tudo é uma só: só passa quem tem declaração EXPLÍCITA.
 * `null` e `undefined` são "o restaurante não informou", e confundi-los com
 * `false` faz o cardápio afirmar "sem lactose" sobre um prato que ninguém
 * verificou. Quase todos os testes abaixo são variações dessa linha.
 */

import { describe, expect, it } from "vitest";
import {
  RESTRICOES,
  atende,
  booleanParaTri,
  filtrarPorRestricoes,
  restricoesDisponiveis,
  triParaBoolean,
  type DeclaracaoAlimentar,
} from "./restricoes";

const prato = (id: string, declaracao: DeclaracaoAlimentar = {}) => ({
  id,
  ...declaracao,
});

const ids = (itens: { id: string }[]) => itens.map((i) => i.id);

describe("atende: só declaração explícita passa", () => {
  it.each([
    ["vegano", { isVegan: true }, true],
    ["vegano", { isVegan: false }, false],
    ["vegano", { isVegan: null }, false],
    ["vegano", {}, false],
    ["sem-gluten", { containsGluten: false }, true],
    ["sem-gluten", { containsGluten: true }, false],
    ["sem-gluten", { containsGluten: null }, false],
    ["sem-gluten", {}, false],
    ["sem-lactose", { containsLactose: false }, true],
    ["sem-lactose", { containsLactose: true }, false],
    ["sem-lactose", { containsLactose: null }, false],
    ["sem-lactose", {}, false],
  ] as const)("%s com %j: %s", (restricao, item, esperado) => {
    expect(atende(item, restricao)).toBe(esperado);
  });

  it("vegano não implica sem lactose: o dono precisa declarar", () => {
    expect(atende({ isVegan: true, containsLactose: null }, "sem-lactose")).toBe(false);
  });
});

describe("filtrarPorRestricoes", () => {
  const itens = [
    prato("a", { containsGluten: false, containsLactose: false, isVegan: true }),
    prato("b", { containsGluten: false, containsLactose: true, isVegan: false }),
    prato("c", { containsGluten: null, containsLactose: false }),
    prato("d"),
  ];

  it("sem filtro ativo devolve tudo, na mesma ordem", () => {
    expect(ids(filtrarPorRestricoes(itens, []))).toEqual(["a", "b", "c", "d"]);
  });

  it("um filtro devolve só quem declarou", () => {
    expect(ids(filtrarPorRestricoes(itens, ["sem-lactose"]))).toEqual(["a", "c"]);
    expect(ids(filtrarPorRestricoes(itens, ["sem-gluten"]))).toEqual(["a", "b"]);
  });

  it("filtros se combinam por E", () => {
    expect(ids(filtrarPorRestricoes(itens, ["sem-gluten", "sem-lactose"]))).toEqual(["a"]);
  });

  it("item sem nenhuma declaração nunca passa", () => {
    const soSemInfo = [prato("d")];
    for (const { id } of RESTRICOES) {
      expect(filtrarPorRestricoes(soSemInfo, [id])).toEqual([]);
    }
  });

  it("não altera a lista de entrada", () => {
    const copia = [...itens];
    filtrarPorRestricoes(itens, ["vegano"]);
    expect(itens).toEqual(copia);
  });
});

describe("restricoesDisponiveis: o botão só existe se há o que mostrar", () => {
  it("cardápio sem nenhuma declaração não habilita botão nenhum", () => {
    expect(restricoesDisponiveis([prato("a"), prato("b")])).toEqual([]);
  });

  it("declarar que CONTÉM não habilita o botão 'sem'", () => {
    expect(
      restricoesDisponiveis([prato("a", { containsGluten: true, containsLactose: true, isVegan: false })])
    ).toEqual([]);
  });

  it("habilita só o que algum item declara", () => {
    expect(restricoesDisponiveis([prato("a", { containsLactose: false })])).toEqual(["sem-lactose"]);
  });

  it("segue a ordem de RESTRICOES, não a dos itens", () => {
    const itens = [
      prato("a", { containsLactose: false }),
      prato("b", { isVegan: true }),
      prato("c", { containsGluten: false }),
    ];
    expect(restricoesDisponiveis(itens)).toEqual(["vegano", "sem-gluten", "sem-lactose"]);
  });
});

describe("tri-estado do formulário", () => {
  it.each([
    ["sim", true],
    ["nao", false],
    ["nd", null],
  ] as const)("%s vira %s", (tri, esperado) => {
    expect(triParaBoolean(tri)).toBe(esperado);
  });

  it("valor desconhecido vira null, e nunca false", () => {
    expect(triParaBoolean("" as never)).toBeNull();
    expect(triParaBoolean("false" as never)).toBeNull();
    expect(triParaBoolean(undefined as never)).toBeNull();
  });

  it.each([
    [true, "sim"],
    [false, "nao"],
    [null, "nd"],
    [undefined, "nd"],
  ] as const)("%s volta como %s", (valor, esperado) => {
    expect(booleanParaTri(valor)).toBe(esperado);
  });

  it("ida e volta preserva os três estados", () => {
    for (const tri of ["sim", "nao", "nd"] as const) {
      expect(booleanParaTri(triParaBoolean(tri))).toBe(tri);
    }
  });
});
