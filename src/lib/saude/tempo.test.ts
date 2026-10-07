import { describe, expect, it } from "vitest";
import { tempoDesde } from "./tempo";

const AGORA = new Date("2026-10-07T15:00:00Z");
const antes = (ms: number) => new Date(AGORA.getTime() - ms);
const MIN = 60_000;

describe("tempoDesde", () => {
  it.each([
    [30_000, "agora"],
    [5 * MIN, "há 5 min"],
    [59 * MIN, "há 59 min"],
    [60 * MIN, "há 1 h"],
    [47 * 60 * MIN, "há 47 h"],
    [48 * 60 * MIN, "há 2 dias"],
  ])("%i ms atrás é %s", (ms, texto) => {
    expect(tempoDesde(antes(ms), AGORA)).toBe(texto);
  });

  it("data no futuro (relógio adiantado) vira agora", () => {
    expect(tempoDesde(new Date(AGORA.getTime() + MIN), AGORA)).toBe("agora");
  });
});
