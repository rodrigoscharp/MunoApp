// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// O canal do Supabase, dublado: guarda o callback de status para o teste
// decidir quando o canal "conecta" ou "cai".
const canais = vi.hoisted(() => ({
  status: [] as ((s: string) => void)[],
  eventos: [] as Record<string, (m: { payload: unknown }) => void>[],
  removidos: 0,
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: () => {
      const tratadores: Record<string, (m: { payload: unknown }) => void> = {};
      canais.eventos.push(tratadores);
      const c = {
        on: (_t: string, f: { event: string }, cb: (m: { payload: unknown }) => void) => {
          tratadores[f.event] = cb;
          return c;
        },
        subscribe: (cb: (s: string) => void) => {
          canais.status.push(cb);
          return c;
        },
      };
      return c;
    },
    removeChannel: () => {
      canais.removidos++;
    },
  },
}));

import { useTopicoRealtime, useCanalRealtime, esperaDaTentativa } from "./useTopicoRealtime";
import { _esquecerCanais } from "@/lib/canal-compartilhado";

const fetchMock = vi.fn();

beforeEach(() => {
  _esquecerCanais();
  canais.status.length = 0;
  canais.eventos.length = 0;
  canais.removidos = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const resposta = (topic: string) =>
  Promise.resolve({ ok: true, json: async () => ({ topic }) } as Response);

describe("useTopicoRealtime", () => {
  it("busca o tópico do canal pedido e o devolve", async () => {
    fetchMock.mockImplementation(() => resposta("t1"));
    const { result } = renderHook(() => useTopicoRealtime("kitchen"));

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe("t1"));
    expect(fetchMock).toHaveBeenCalledWith("/api/realtime/topic?canal=kitchen");
  });

  it("manda o id do pedido", async () => {
    fetchMock.mockImplementation(() => resposta("t2"));
    renderHook(() => useTopicoRealtime("order", "o1"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/realtime/topic?canal=order&id=o1");
  });

  it("canal de pedido sem id não faz nenhuma chamada", () => {
    const { result } = renderHook(() => useTopicoRealtime("order", null));
    expect(result.current).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("desabilitado não faz nenhuma chamada", () => {
    renderHook(() => useTopicoRealtime("user", "u1", false));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // O polling de reserva cobre quem fica sem o aviso instantâneo.
  it("recusa do servidor ou rede fora do ar deixa o tópico em null, sem estourar", async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, json: async () => ({}) } as Response));
    const { result } = renderHook(() => useTopicoRealtime("kitchen"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current).toBeNull();

    fetchMock.mockImplementation(() => Promise.reject(new Error("rede")));
    const outro = renderHook(() => useTopicoRealtime("user", "u1"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(outro.result.current).toBeNull();
  });

  it("ao trocar de pedido, o tópico do anterior deixa de valer na hora", async () => {
    fetchMock.mockImplementation((url: string) => resposta(url.includes("id=o1") ? "t-o1" : "t-o2"));
    const { result, rerender } = renderHook(({ id }) => useTopicoRealtime("order", id), {
      initialProps: { id: "o1" },
    });
    await waitFor(() => expect(result.current).toBe("t-o1"));

    rerender({ id: "o2" });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe("t-o2"));
  });
});

describe("useTopicoRealtime: nova tentativa", () => {
  it("espera cresce e para em 60s", () => {
    expect(esperaDaTentativa(0)).toBe(2_000);
    expect(esperaDaTentativa(1)).toBe(4_000);
    expect(esperaDaTentativa(10)).toBe(60_000);
  });

  // Antes a busca era única: uma queda de rede no carregamento deixava a tela
  // sem tempo real até alguém recarregar.
  it("rede fora do ar: tenta de novo e pega o tópico quando volta", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error("rede")));
    fetchMock.mockImplementation(() => resposta("t-volta"));

    const { result } = renderHook(() => useTopicoRealtime("kitchen"));
    await act(async () => {});
    expect(result.current).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(result.current).toBe("t-volta");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("recusa (403) não é repetida", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 403, json: async () => ({}) } as Response)
    );
    renderHook(() => useTopicoRealtime("kitchen"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("useCanalRealtime", () => {
  it("conectando até o SUBSCRIBED, conectado depois", async () => {
    fetchMock.mockImplementation(() => resposta("t1"));
    const { result } = renderHook(() => useCanalRealtime("kitchen", null, { "order-created": () => {} }));

    expect(result.current).toBe("conectando");
    await waitFor(() => expect(canais.status).toHaveLength(1));
    act(() => canais.status[0]("SUBSCRIBED"));
    expect(result.current).toBe("conectado");
  });

  it.each(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"])(
    "%s vira sem-tempo-real e reabre o canal depois da espera",
    async (queda) => {
      fetchMock.mockImplementation(() => resposta(`t-${queda}`));
      const { result } = renderHook(() => useCanalRealtime("kitchen", null, { x: () => {} }));
      await waitFor(() => expect(canais.status).toHaveLength(1));

      vi.useFakeTimers();
      act(() => canais.status[0](queda));
      expect(result.current).toBe("sem-tempo-real");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(canais.removidos).toBe(1);
      expect(canais.status).toHaveLength(2);

      act(() => canais.status[1]("SUBSCRIBED"));
      expect(result.current).toBe("conectado");
    }
  );

  it("tópico que não vem é sem-tempo-real, para o polling apertar", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 403, json: async () => ({}) } as Response)
    );
    const { result } = renderHook(() => useCanalRealtime("kitchen", null, { x: () => {} }));
    await waitFor(() => expect(result.current).toBe("sem-tempo-real"));
  });

  it("entrega o payload ao tratador mais recente, sem reabrir o canal", async () => {
    fetchMock.mockImplementation(() => resposta("t-payload"));
    const primeiro = vi.fn();
    const segundo = vi.fn();
    const { rerender } = renderHook(({ f }) => useCanalRealtime("kitchen", null, { ev: f }), {
      initialProps: { f: primeiro },
    });
    await waitFor(() => expect(canais.eventos).toHaveLength(1));

    rerender({ f: segundo });
    act(() => canais.eventos[0].ev({ payload: { id: "o1" } }));

    expect(primeiro).not.toHaveBeenCalled();
    expect(segundo).toHaveBeenCalledWith({ id: "o1" });
    expect(canais.eventos).toHaveLength(1);
  });
});
