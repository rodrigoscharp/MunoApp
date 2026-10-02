// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { iniciarPollingVisivel } from "./polling-visivel";

function aba(escondida: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, value: escondida });
}

beforeEach(() => {
  vi.useFakeTimers();
  aba(false);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("iniciarPollingVisivel", () => {
  it("consulta a cada intervalo com a aba visível", () => {
    const fn = vi.fn();
    iniciarPollingVisivel(fn, 1000);

    vi.advanceTimersByTime(3000);

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("não consulta com a aba escondida", () => {
    const fn = vi.fn();
    iniciarPollingVisivel(fn, 1000);
    aba(true);

    vi.advanceTimersByTime(5000);

    expect(fn).not.toHaveBeenCalled();
  });

  it("ao voltar para a aba, consulta uma vez na hora", () => {
    const fn = vi.fn();
    iniciarPollingVisivel(fn, 60_000);
    aba(true);
    vi.advanceTimersByTime(120_000);
    aba(false);

    document.dispatchEvent(new Event("visibilitychange"));

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("esconder a aba não dispara consulta", () => {
    const fn = vi.fn();
    iniciarPollingVisivel(fn, 60_000);
    aba(true);

    document.dispatchEvent(new Event("visibilitychange"));

    expect(fn).not.toHaveBeenCalled();
  });

  it("o cancelamento para o tique e solta o ouvinte", () => {
    const fn = vi.fn();
    const parar = iniciarPollingVisivel(fn, 1000);
    parar();

    vi.advanceTimersByTime(5000);
    document.dispatchEvent(new Event("visibilitychange"));

    expect(fn).not.toHaveBeenCalled();
  });
});
