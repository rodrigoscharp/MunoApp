import { describe, it, expect } from "vitest";
import { ehIOS } from "./plataforma";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_ANTIGO =
  "Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1";
const IPAD_MODERNO =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";

describe("ehIOS", () => {
  it("reconhece iPhone e iPad antigo pelo user agent", () => {
    expect(ehIOS(IPHONE, 5)).toBe(true);
    expect(ehIOS(IPAD_ANTIGO, 5)).toBe(true);
  });

  it("reconhece o iPad moderno, que se anuncia como Macintosh", () => {
    // Desde o iPadOS 13 o Safari do iPad manda user agent de desktop. O que o
    // separa de um Mac é a tela sensível ao toque.
    expect(ehIOS(IPAD_MODERNO, 5)).toBe(true);
  });

  it("não confunde um Mac de verdade com iPad", () => {
    expect(ehIOS(MAC, 0)).toBe(false);
  });

  it("é falso no Android, que tem o caminho próprio", () => {
    expect(ehIOS(ANDROID, 5)).toBe(false);
  });
});
