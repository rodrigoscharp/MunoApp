import { describe, expect, it } from "vitest";
import { relativePosition } from "./table-map-position";

const RECT = { left: 100, top: 200, width: 400, height: 300 };

describe("relativePosition", () => {
  it("calcula a fração dentro do retângulo", () => {
    expect(relativePosition(300, 350, RECT)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("clampa em 0 quando o ponto está antes do início do retângulo", () => {
    expect(relativePosition(0, 0, RECT)).toEqual({ x: 0, y: 0 });
  });

  it("clampa em 1 quando o ponto está além do fim do retângulo", () => {
    expect(relativePosition(1000, 1000, RECT)).toEqual({ x: 1, y: 1 });
  });
});
