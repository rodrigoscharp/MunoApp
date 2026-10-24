import { describe, expect, it, vi } from "vitest";
import { pendentesSemCiencia, tituloDoAlerta, tocarBipe } from "./alerta-cozinha";

describe("pendentesSemCiencia", () => {
  const pedidos = [
    { id: "a", status: "PENDING" },
    { id: "b", status: "PENDING" },
    { id: "c", status: "CONFIRMED" },
  ];

  it("só pendentes, e só os que ninguém tocou", () => {
    expect(pendentesSemCiencia(pedidos, new Set())).toEqual(["a", "b"]);
    expect(pendentesSemCiencia(pedidos, new Set(["a"]))).toEqual(["b"]);
  });

  it("pedido confirmado para de tocar mesmo sem ciência", () => {
    expect(pendentesSemCiencia([{ id: "a", status: "CONFIRMED" }], new Set())).toEqual([]);
  });
});

describe("tituloDoAlerta", () => {
  it("alterna entre o aviso e o título original", () => {
    expect(tituloDoAlerta("Cozinha", 1, true)).toBe("(1) Novo pedido!");
    expect(tituloDoAlerta("Cozinha", 3, true)).toBe("(3) Novos pedidos!");
    expect(tituloDoAlerta("Cozinha", 3, false)).toBe("Cozinha");
    expect(tituloDoAlerta("Cozinha", 0, true)).toBe("Cozinha");
  });
});

describe("tocarBipe", () => {
  it("agenda dois tons curtos no contexto de áudio", () => {
    const osciladores: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
    const param = () => ({
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    });
    const ctx = {
      currentTime: 10,
      destination: {},
      createOscillator: () => {
        const o = {
          type: "",
          frequency: param(),
          connect: (g: unknown) => g,
          start: vi.fn(),
          stop: vi.fn(),
        };
        osciladores.push(o);
        return o;
      },
      createGain: () => ({ gain: param(), connect: vi.fn() }),
    } as unknown as AudioContext;

    tocarBipe(ctx);

    expect(osciladores).toHaveLength(2);
    expect(osciladores[0].start).toHaveBeenCalledWith(10);
    expect(osciladores[1].stop.mock.calls[0][0]).toBeLessThan(11);
  });
});
