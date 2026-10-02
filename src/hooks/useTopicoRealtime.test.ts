// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTopicoRealtime } from "./useTopicoRealtime";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

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
