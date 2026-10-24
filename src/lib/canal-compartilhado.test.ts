import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Dublê do cliente do Supabase com a mesma regra que o de verdade: um canal
// por tópico enquanto ele estiver na lista, e o removeChannel só tira da lista
// quando a saída termina (aqui, quando o teste resolver a promessa).
const sb = vi.hoisted(() => {
  type Canal = {
    topic: string;
    tratadores: Record<string, (m: { payload: unknown }) => void>;
    status?: (s: string) => void;
    on: (t: string, f: { event: string }, cb: (m: { payload: unknown }) => void) => Canal;
    subscribe: (cb: (s: string) => void) => Canal;
  };
  const lista: Canal[] = [];
  const criados: Canal[] = [];
  const saidas: (() => void)[] = [];
  return {
    lista,
    criados,
    saidas,
    channel(topic: string): Canal {
      const existe = lista.find((c) => c.topic === topic);
      if (existe) return existe;
      const c: Canal = {
        topic,
        tratadores: {},
        on(_t, f, cb) {
          c.tratadores[f.event] = cb;
          return c;
        },
        subscribe(cb) {
          c.status = cb;
          return c;
        },
      };
      lista.push(c);
      criados.push(c);
      return c;
    },
    removeChannel(c: Canal) {
      return new Promise<void>((resolve) => {
        saidas.push(() => {
          lista.splice(lista.indexOf(c), 1);
          resolve();
        });
      });
    },
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: { channel: sb.channel, removeChannel: sb.removeChannel },
}));

import { _esquecerCanais, entrarNoCanal, reabrirCanal } from "./canal-compartilhado";

function terminarSaidas() {
  while (sb.saidas.length) sb.saidas.shift()!();
}

beforeEach(() => {
  _esquecerCanais();
  sb.lista.length = 0;
  sb.criados.length = 0;
  sb.saidas.length = 0;
});
afterEach(() => vi.useRealTimers());

describe("canal compartilhado", () => {
  it("quem sai não derruba o canal de quem fica", () => {
    const chat = vi.fn();
    const mapa = vi.fn();
    const sairChat = entrarNoCanal("t", ["chat-message"], { tratadores: () => ({ "chat-message": chat }) });
    entrarNoCanal("t", ["tracking-updated"], { tratadores: () => ({ "tracking-updated": mapa }) });

    expect(sb.criados).toHaveLength(1);
    sairChat();
    expect(sb.saidas).toHaveLength(0);

    sb.criados[0].tratadores["tracking-updated"]({ payload: { lat: 1, lng: 2 } });
    expect(mapa).toHaveBeenCalledWith({ lat: 1, lng: 2 });
    expect(chat).not.toHaveBeenCalled();
  });

  it("o último a sair fecha o canal", () => {
    const sair1 = entrarNoCanal("t", ["a"], { tratadores: () => ({}) });
    const sair2 = entrarNoCanal("t", ["b"], { tratadores: () => ({}) });
    sair1();
    sair2();
    expect(sb.saidas).toHaveLength(1);
  });

  it("quem chega com o canal de pé recebe o status na hora", () => {
    entrarNoCanal("t", ["a"], { tratadores: () => ({}) });
    sb.criados[0].status!("SUBSCRIBED");

    const aoMudarStatus = vi.fn();
    entrarNoCanal("t", ["b"], { tratadores: () => ({}), aoMudarStatus });
    expect(aoMudarStatus).toHaveBeenCalledWith("conectado");
  });

  it("reabrir espera a saída do canal anterior, senão reassinaria o mesmo", async () => {
    entrarNoCanal("t", ["a"], { tratadores: () => ({}) });
    reabrirCanal("t");
    // A saída ainda não terminou: nada de canal novo.
    expect(sb.criados).toHaveLength(1);

    terminarSaidas();
    await new Promise((r) => setTimeout(r, 0));
    expect(sb.criados).toHaveLength(2);
    expect(sb.criados[1]).not.toBe(sb.criados[0]);
  });

  it("canal que cai é reaberto com espera, e o status avisa os ouvintes", async () => {
    vi.useFakeTimers();
    const aoMudarStatus = vi.fn();
    entrarNoCanal("t", ["a"], { tratadores: () => ({}), aoMudarStatus });

    sb.criados[0].status!("CHANNEL_ERROR");
    expect(aoMudarStatus).toHaveBeenLastCalledWith("caiu");

    await vi.advanceTimersByTimeAsync(2_000);
    terminarSaidas();
    await vi.advanceTimersByTimeAsync(0);
    expect(sb.criados).toHaveLength(2);

    sb.criados[1].status!("SUBSCRIBED");
    expect(aoMudarStatus).toHaveBeenLastCalledWith("conectado");
  });

  it("o CLOSED de um canal que já trocamos não conta como queda", () => {
    const aoMudarStatus = vi.fn();
    const sair = entrarNoCanal("t", ["a"], { tratadores: () => ({}), aoMudarStatus });
    const antigo = sb.criados[0];
    sair();
    antigo.status!("CLOSED");
    expect(aoMudarStatus).not.toHaveBeenCalledWith("caiu");
  });
});
