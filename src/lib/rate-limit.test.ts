import { describe, expect, it } from "vitest";
import { criarLimitador } from "./rate-limit";

describe("criarLimitador", () => {
  it("permite até o teto e barra o seguinte", () => {
    const limitador = criarLimitador({ max: 3, janelaMs: 1000 });

    expect(limitador.permitir("ip-1", 0)).toBe(true);
    expect(limitador.permitir("ip-1", 10)).toBe(true);
    expect(limitador.permitir("ip-1", 20)).toBe(true);
    expect(limitador.permitir("ip-1", 30)).toBe(false);
  });

  it("conta cada chave separadamente", () => {
    const limitador = criarLimitador({ max: 1, janelaMs: 1000 });

    expect(limitador.permitir("ip-1", 0)).toBe(true);
    expect(limitador.permitir("ip-1", 1)).toBe(false);
    expect(limitador.permitir("ip-2", 1)).toBe(true);
  });

  it("libera de novo quando a janela passa", () => {
    const limitador = criarLimitador({ max: 1, janelaMs: 1000 });

    expect(limitador.permitir("ip-1", 0)).toBe(true);
    expect(limitador.permitir("ip-1", 999)).toBe(false);
    expect(limitador.permitir("ip-1", 1000)).toBe(true);
  });

  it("é janela deslizante, não balde que zera de tempos em tempos", () => {
    const limitador = criarLimitador({ max: 2, janelaMs: 1000 });

    expect(limitador.permitir("ip-1", 0)).toBe(true);
    expect(limitador.permitir("ip-1", 900)).toBe(true);
    // 1000 expira só a marca de 0; a de 900 continua viva.
    expect(limitador.permitir("ip-1", 1000)).toBe(true);
    expect(limitador.permitir("ip-1", 1001)).toBe(false);
  });

  it("poda chave inativa para o mapa não crescer sem limite", () => {
    const limitador = criarLimitador({ max: 5, janelaMs: 1000 });

    limitador.permitir("ip-1", 0);
    limitador.permitir("ip-2", 0);
    expect(limitador.chaves).toBe(2);

    // Uma chamada de outro IP, muito depois: as duas primeiras já morreram.
    limitador.permitir("ip-3", 5000);
    expect(limitador.chaves).toBe(1);
  });
});
