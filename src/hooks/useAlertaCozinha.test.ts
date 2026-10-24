// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAlertaCozinha } from "./useAlertaCozinha";

/** AudioContext de mentira: conta quantos bipes (pares de osciladores) saíram. */
let osciladores = 0;
class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {});
  createOscillator() {
    osciladores++;
    return { frequency: {}, connect: (g: unknown) => g, start() {}, stop() {} };
  }
  createGain() {
    return {
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect: () => {},
    };
  }
}

const pendente = (id: string) => ({ id, status: "PENDING" });

beforeEach(() => {
  osciladores = 0;
  window.localStorage.clear();
  document.title = "Cozinha";
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useAlertaCozinha", () => {
  it("começa sem som: o navegador exige um gesto antes", () => {
    const { result } = renderHook(() => useAlertaCozinha([pendente("a")]));
    expect(result.current.somAtivo).toBe(false);
    expect(osciladores).toBe(0);
  });

  it("ativar o som guarda a escolha e bipe repete até a ciência", () => {
    const { result } = renderHook(() => useAlertaCozinha([pendente("a")]));

    act(() => result.current.alternarSom());
    expect(window.localStorage.getItem("muno:cozinha:som")).toBe("1");
    const depoisDeAtivar = osciladores;
    expect(depoisDeAtivar).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(8_000);
    });
    expect(osciladores).toBeGreaterThan(depoisDeAtivar);

    act(() => result.current.ciente());
    const depoisDaCiencia = osciladores;
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(osciladores).toBe(depoisDaCiencia);
    expect(result.current.alertando).toEqual([]);
  });

  it("a escolha guardada vale na próxima visita", () => {
    window.localStorage.setItem("muno:cozinha:som", "1");
    const { result } = renderHook(() => useAlertaCozinha([]));
    expect(result.current.somAtivo).toBe(true);
  });

  it("localStorage bloqueado não derruba o quadro", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const { result } = renderHook(() => useAlertaCozinha([]));
    expect(result.current.somAtivo).toBe(false);
    act(() => result.current.alternarSom());
    expect(result.current.somAtivo).toBe(true);
    vi.restoreAllMocks();
  });

  it("pisca o título enquanto houver pendente e devolve o original depois", () => {
    const { result } = renderHook(() => useAlertaCozinha([pendente("a"), pendente("b")]));
    expect(document.title).toBe("(2) Novos pedidos!");
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(document.title).toBe("Cozinha");

    act(() => result.current.ciente());
    expect(document.title).toBe("Cozinha");
  });

  it("ciência de um card só cala aquele pedido", () => {
    const { result } = renderHook(() => useAlertaCozinha([pendente("a"), pendente("b")]));
    act(() => result.current.ciente(["a"]));
    expect(result.current.alertando).toEqual(["b"]);
  });

  it("pede a tela acesa quando o navegador oferece, e solta ao sair", async () => {
    const release = vi.fn(async () => {});
    const request = vi.fn(async () => ({ release }));
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });

    const { unmount } = renderHook(() => useAlertaCozinha([]));
    await act(async () => {});
    expect(request).toHaveBeenCalledWith("screen");

    unmount();
    expect(release).toHaveBeenCalled();
    delete (navigator as unknown as Record<string, unknown>).wakeLock;
  });
});
