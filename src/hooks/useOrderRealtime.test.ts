// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const canal = vi.hoisted(() => ({ estado: "sem-tempo-real" as string, tratadores: {} as Record<string, (p: Record<string, unknown>) => void> }));
vi.mock("@/hooks/useTopicoRealtime", () => ({
  useCanalRealtime: (_c: string, _id: string, t: Record<string, (p: Record<string, unknown>) => void>) => {
    canal.tratadores = t;
    return canal.estado;
  },
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));

import { toast } from "sonner";
import {
  useOrderRealtime,
  lerAtualizacaoDoPedido,
  intervaloDoAcompanhamento,
} from "./useOrderRealtime";

const fetchMock = vi.fn();

beforeEach(() => {
  canal.estado = "sem-tempo-real";
  fetchMock.mockReset();
  vi.mocked(toast.info).mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const responde = (dado: unknown) =>
  fetchMock.mockImplementation(() => Promise.resolve({ ok: true, json: async () => dado }));

describe("lerAtualizacaoDoPedido", () => {
  it("lê status, pagamento e previsão", () => {
    const a = lerAtualizacaoDoPedido({
      status: "READY",
      paymentStatus: "PAID",
      estimatedDeliveryAt: "2026-10-24T20:00:00.000Z",
    });
    expect(a.status).toBe("READY");
    expect(a.paymentStatus).toBe("PAID");
    expect(a.estimatedDeliveryAt?.toISOString()).toBe("2026-10-24T20:00:00.000Z");
  });

  it("ignora campo ausente ou desconhecido", () => {
    expect(lerAtualizacaoDoPedido({ status: "X", paymentStatus: 1, estimatedDeliveryAt: null })).toEqual({});
    expect(lerAtualizacaoDoPedido(null)).toEqual({});
  });
});

describe("useOrderRealtime", () => {
  it("15s sem tempo real, mais esparso com ele", () => {
    expect(intervaloDoAcompanhamento(false)).toBe(15_000);
    expect(intervaloDoAcompanhamento(true)).toBeGreaterThanOrEqual(30_000);
  });

  it("sem tempo real, o polling traz o pagamento confirmado", async () => {
    responde({ status: "PENDING", paymentStatus: "PAID" });
    const { result } = renderHook(() => useOrderRealtime("o1", { status: "PENDING" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/orders/o1");
    expect(result.current.paymentStatus).toBe("PAID");
    // Mesmo status do inicial: nenhum aviso.
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("aba escondida não consulta", async () => {
    responde({ status: "PENDING" });
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    renderHook(() => useOrderRealtime("o1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });

  it("com tempo real, o polling fica esparso", async () => {
    canal.estado = "conectado";
    responde({ status: "PENDING" });
    renderHook(() => useOrderRealtime("o1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("o broadcast atualiza status e pagamento, e avisa só quando o status muda", () => {
    canal.estado = "conectado";
    const { result } = renderHook(() => useOrderRealtime("o1", { status: "PENDING" }));

    act(() => canal.tratadores["order-updated"]({ status: "CONFIRMED", paymentStatus: "PAID" }));
    expect(result.current.status).toBe("CONFIRMED");
    expect(result.current.paymentStatus).toBe("PAID");
    expect(toast.info).toHaveBeenCalledTimes(1);

    act(() => canal.tratadores["order-updated"]({ status: "CONFIRMED" }));
    expect(toast.info).toHaveBeenCalledTimes(1);
  });
});
