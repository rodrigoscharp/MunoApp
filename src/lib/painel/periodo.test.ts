import { describe, expect, it } from "vitest";
import {
  classificarClientes,
  compararPeriodos,
  dataPorExtenso,
  formatarEspera,
  intervaloDoPeriodo,
  lerPeriodo,
  montarMapaDeCalor,
  nivelDoCalor,
  nomeCurto,
  saudacao,
} from "./periodo";

// Sábado, 24/10/2026, 21:30 em Brasília (00:30 UTC do dia 25).
const AGORA = new Date("2026-10-25T00:30:00.000Z");
const iso = (d: Date) => d.toISOString();

describe("lerPeriodo", () => {
  it("aceita os quatro períodos", () => {
    expect(lerPeriodo("hoje")).toBe("hoje");
    expect(lerPeriodo("7d")).toBe("7d");
    expect(lerPeriodo("30d")).toBe("30d");
    expect(lerPeriodo("mes")).toBe("mes");
  });

  it("cai no padrão com valor desconhecido, ausente ou repetido", () => {
    expect(lerPeriodo("ano")).toBe("7d");
    expect(lerPeriodo(undefined)).toBe("7d");
    expect(lerPeriodo(["hoje", "mes"])).toBe("7d");
  });
});

describe("intervaloDoPeriodo, em fuso de Brasília", () => {
  it("hoje começa à meia-noite de Brasília, não de UTC", () => {
    // Em UTC já é dia 25; em Brasília ainda é 24, 21:30.
    const { atual, diasDaSerie } = intervaloDoPeriodo("hoje", AGORA);
    expect(iso(atual.inicio)).toBe("2026-10-24T03:00:00.000Z");
    expect(atual.fim).toEqual(AGORA);
    expect(diasDaSerie.at(-1)).toBe("2026-10-24");
  });

  it("hoje se compara com ontem até a mesma hora", () => {
    const { anterior } = intervaloDoPeriodo("hoje", AGORA);
    expect(iso(anterior.inicio)).toBe("2026-10-23T03:00:00.000Z");
    expect(iso(anterior.fim)).toBe("2026-10-24T00:30:00.000Z");
  });

  it("hoje desenha a semana, terminando em hoje", () => {
    const { diasDaSerie } = intervaloDoPeriodo("hoje", AGORA);
    expect(diasDaSerie).toEqual([
      "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24",
    ]);
  });

  it("7 dias contam hoje como o sétimo, e o anterior tem a mesma duração", () => {
    const { atual, anterior, diasDaSerie } = intervaloDoPeriodo("7d", AGORA);
    expect(iso(atual.inicio)).toBe("2026-10-18T03:00:00.000Z");
    expect(diasDaSerie).toHaveLength(7);
    expect(diasDaSerie[0]).toBe("2026-10-18");
    expect(anterior.fim.getTime() - anterior.inicio.getTime()).toBe(
      atual.fim.getTime() - atual.inicio.getTime()
    );
    expect(iso(anterior.inicio)).toBe("2026-10-11T03:00:00.000Z");
  });

  it("30 dias desenham 30 barras", () => {
    const { atual, diasDaSerie } = intervaloDoPeriodo("30d", AGORA);
    expect(diasDaSerie).toHaveLength(30);
    expect(diasDaSerie[0]).toBe(new Date(atual.inicio.getTime() - 3 * 3600_000).toISOString().slice(0, 10));
    expect(diasDaSerie.at(-1)).toBe("2026-10-24");
  });

  it("o mês vai do dia 1º até hoje e se compara com o mesmo trecho do mês passado", () => {
    const { atual, anterior, diasDaSerie } = intervaloDoPeriodo("mes", AGORA);
    expect(iso(atual.inicio)).toBe("2026-10-01T03:00:00.000Z");
    expect(iso(anterior.inicio)).toBe("2026-09-01T03:00:00.000Z");
    // 24/09, 21:30 em Brasília.
    expect(iso(anterior.fim)).toBe("2026-09-25T00:30:00.000Z");
    expect(diasDaSerie).toHaveLength(24);
  });

  it("o trecho do mês passado é cortado quando ele é mais curto", () => {
    // 31 de março, 12h em Brasília: fevereiro não tem dia 31.
    const fimDeMarco = new Date("2027-03-31T15:00:00.000Z");
    const { anterior } = intervaloDoPeriodo("mes", fimDeMarco);
    expect(iso(anterior.inicio)).toBe("2027-02-01T03:00:00.000Z");
    expect(iso(anterior.fim)).toBe("2027-03-01T03:00:00.000Z");
  });

  it("no dia 1º o mês tem uma barra só", () => {
    const { diasDaSerie } = intervaloDoPeriodo("mes", new Date("2026-11-01T13:00:00.000Z"));
    expect(diasDaSerie).toEqual(["2026-11-01"]);
  });
});

describe("compararPeriodos", () => {
  it("dá o percentual arredondado", () => {
    expect(compararPeriodos(112, 100)).toEqual({ sentido: "subiu", pct: 12, delta: 12 });
    expect(compararPeriodos(80, 100)).toEqual({ sentido: "caiu", pct: -20, delta: -20 });
  });

  it("sem base não inventa percentual", () => {
    expect(compararPeriodos(5, 0)).toEqual({ sentido: "novo", pct: null, delta: 5 });
    expect(compararPeriodos(0, 0)).toEqual({ sentido: "igual", pct: null, delta: 0 });
  });

  it("variação que arredonda para zero é igual", () => {
    expect(compararPeriodos(1001, 1000).sentido).toBe("igual");
  });
});

describe("montarMapaDeCalor", () => {
  it("põe cada balde na linha do dia e na coluna da hora", () => {
    const mapa = montarMapaDeCalor([
      { diaDaSemana: 5, hora: 20, pedidos: 9 },
      { diaDaSemana: 0, hora: 12, pedidos: 3 },
    ]);
    expect(mapa.celulas).toHaveLength(7);
    expect(mapa.celulas[5][20]).toBe(9);
    expect(mapa.celulas[0][12]).toBe(3);
    expect(mapa.maximo).toBe(9);
    expect(mapa.pico).toEqual({ diaDaSemana: 5, hora: 20, pedidos: 9 });
  });

  it("desenha só da primeira à última hora com pedido", () => {
    const mapa = montarMapaDeCalor([
      { diaDaSemana: 1, hora: 18, pedidos: 1 },
      { diaDaSemana: 2, hora: 23, pedidos: 2 },
    ]);
    expect(mapa.horas).toEqual([18, 19, 20, 21, 22, 23]);
  });

  it("sem pedido, mostra o horário comercial e nenhum pico", () => {
    const mapa = montarMapaDeCalor([]);
    expect(mapa.pico).toBeNull();
    expect(mapa.horas[0]).toBe(11);
    expect(mapa.horas.at(-1)).toBe(22);
  });

  it("descarta balde fora de faixa e aceita número que veio como texto", () => {
    const mapa = montarMapaDeCalor([
      { diaDaSemana: 7, hora: 10, pedidos: 5 },
      { diaDaSemana: 1, hora: 24, pedidos: 5 },
      { diaDaSemana: "3" as unknown as number, hora: "9" as unknown as number, pedidos: "4" as unknown as number },
    ]);
    expect(mapa.maximo).toBe(4);
    expect(mapa.celulas[3][9]).toBe(4);
  });
});

describe("nivelDoCalor", () => {
  it("zero é vazio e o máximo é o tom mais forte", () => {
    expect(nivelDoCalor(0, 10)).toBe(0);
    expect(nivelDoCalor(10, 10)).toBe(4);
    expect(nivelDoCalor(1, 10)).toBe(1);
    expect(nivelDoCalor(6, 10)).toBe(3);
  });
});

describe("classificarClientes", () => {
  const inicio = new Date("2026-10-18T03:00:00.000Z");

  it("separa quem pediu pela primeira vez no período de quem voltou", () => {
    const r = classificarClientes(
      [
        { primeiroPedido: "2026-10-20T15:00:00.000Z", pedidos: 1 },
        { primeiroPedido: "2026-08-01T15:00:00.000Z", pedidos: 3 },
        { primeiroPedido: "2026-09-10T15:00:00.000Z", pedidos: 2 },
      ],
      inicio
    );
    expect(r).toEqual({ novos: 1, voltaram: 2, pedidosDeNovos: 1, pedidosDeQuemVoltou: 5 });
  });

  it("o primeiro pedido exatamente no início do período é de cliente novo", () => {
    const r = classificarClientes([{ primeiroPedido: inicio.toISOString(), pedidos: 2 }], inicio);
    expect(r.novos).toBe(1);
  });
});

describe("textos da tela", () => {
  it("cumprimenta pela hora de Brasília", () => {
    expect(saudacao(AGORA)).toBe("Boa noite"); // 21:30
    expect(saudacao(new Date("2026-10-24T12:00:00.000Z"))).toBe("Bom dia"); // 09:00
    expect(saudacao(new Date("2026-10-24T17:00:00.000Z"))).toBe("Boa tarde"); // 14:00
  });

  it("escreve a data do calendário de Brasília", () => {
    expect(dataPorExtenso(AGORA)).toBe("SÁBADO, 24 DE OUTUBRO");
  });

  it("formata a espera", () => {
    expect(formatarEspera(8 * 60_000)).toBe("8 min");
    expect(formatarEspera(125 * 60_000)).toBe("2 h 05");
    expect(formatarEspera(3 * 24 * 3600_000)).toBe("3 dias");
  });

  it("encurta o nome do cliente", () => {
    expect(nomeCurto("Ana Paula Souza")).toBe("Ana S.");
    expect(nomeCurto("Carlos")).toBe("Carlos");
    expect(nomeCurto("  ")).toBeNull();
  });
});
