// @vitest-environment jsdom
/**
 * O hook que decide se, e como, convidar alguém a instalar o app.
 *
 * O alvo aqui não é a aparência do convite, é a decisão: Android e iOS chegam
 * por caminhos diferentes, quem já instalou não pode ver nada, e quem
 * dispensou não pode ser perguntado de novo na sessão seguinte. Cada um desses
 * é um jeito de o convite virar propaganda.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { CHAVE_DISPENSA, DIAS_DE_SILENCIO } from "@/lib/pwa/dispensa";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";

/** jsdom não implementa matchMedia; o hook depende dela para ver standalone. */
function comDisplayMode(standalone: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: standalone && query.includes("standalone"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
}

function comUserAgent(ua: string, maxTouchPoints = 5) {
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: ua });
  Object.defineProperty(navigator, "maxTouchPoints", {
    configurable: true,
    value: maxTouchPoints,
  });
}

/** O evento que o Chrome dispara, com o formato que o hook consome. */
function eventoDeInstalacao(resultado: "accepted" | "dismissed") {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const evento = Object.assign(new Event("beforeinstallprompt"), {
    prompt,
    userChoice: Promise.resolve({ outcome: resultado, platform: "web" }),
  });
  return { evento, prompt };
}

// O listener de beforeinstallprompt é instalado no import do módulo, então
// cada caso precisa de uma instância limpa: sem isto o evento disparado num
// teste continua guardado no seguinte.
async function carregarHook() {
  vi.resetModules();
  const mod = await import("./useInstalacao");
  return mod.useInstalacao;
}

beforeEach(() => {
  localStorage.clear();
  comDisplayMode(false);
  comUserAgent(ANDROID);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useInstalacao", () => {
  it("não oferece nada antes de saber em que aparelho está", async () => {
    // Primeiro render precisa ser igual no servidor e no cliente, senão a
    // hidratação diverge. Nada de window durante o render.
    const useInstalacao = await carregarHook();
    const { result } = renderHook(() => useInstalacao());
    expect(["indisponivel", "android", "ios"]).toContain(result.current.estado);
  });

  it("some quando o app já está instalado", async () => {
    comDisplayMode(true);
    const useInstalacao = await carregarHook();
    const { result } = renderHook(() => useInstalacao());
    expect(result.current.estado).toBe("instalada");
  });

  it("some quando o iOS já está em standalone", async () => {
    // O Safari não implementa display-mode: standalone; ele expõe
    // navigator.standalone. Sem esta segunda checagem o convite apareceria
    // dentro do app já instalado.
    comUserAgent(IPHONE);
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: true,
    });
    const useInstalacao = await carregarHook();
    const { result } = renderHook(() => useInstalacao());
    expect(result.current.estado).toBe("instalada");
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: undefined,
    });
  });

  it("ensina o passo manual no iOS", async () => {
    comUserAgent(IPHONE);
    const useInstalacao = await carregarHook();
    const { result } = renderHook(() => useInstalacao());
    expect(result.current.estado).toBe("ios");
  });

  it("no Android só aparece depois do beforeinstallprompt", async () => {
    const useInstalacao = await carregarHook();
    const { result } = renderHook(() => useInstalacao());
    expect(result.current.estado).toBe("indisponivel");

    const { evento } = eventoDeInstalacao("accepted");
    act(() => {
      window.dispatchEvent(evento);
    });
    expect(result.current.estado).toBe("android");
  });

  it("guarda o evento que chega antes do React montar", async () => {
    // O Chrome dispara beforeinstallprompt no carregamento da página, que é
    // antes de qualquer useEffect rodar. Se o listener só fosse instalado no
    // efeito, o botão do Android nunca apareceria.
    const useInstalacao = await carregarHook();
    const { evento } = eventoDeInstalacao("accepted");
    window.dispatchEvent(evento);

    const { result } = renderHook(() => useInstalacao());
    expect(result.current.estado).toBe("android");
  });

  it("previne o banner nativo do Chrome", async () => {
    await carregarHook();
    const { evento } = eventoDeInstalacao("accepted");
    const prevenir = vi.spyOn(evento, "preventDefault");
    window.dispatchEvent(evento);
    expect(prevenir).toHaveBeenCalled();
  });

  it("respeita a dispensa dentro do prazo, inclusive no iOS", async () => {
    comUserAgent(IPHONE);
    localStorage.setItem(CHAVE_DISPENSA, String(Date.now() - 60_000));
    const useInstalacao = await carregarHook();
    const { result } = renderHook(() => useInstalacao());
    expect(result.current.estado).toBe("indisponivel");
  });

  it("volta a convidar depois do prazo", async () => {
    comUserAgent(IPHONE);
    const vencida = Date.now() - (DIAS_DE_SILENCIO + 1) * 24 * 60 * 60 * 1000;
    localStorage.setItem(CHAVE_DISPENSA, String(vencida));
    const useInstalacao = await carregarHook();
    const { result } = renderHook(() => useInstalacao());
    expect(result.current.estado).toBe("ios");
  });

  it("dispensar grava o carimbo e some da tela", async () => {
    comUserAgent(IPHONE);
    const useInstalacao = await carregarHook();
    const { result } = renderHook(() => useInstalacao());
    expect(result.current.estado).toBe("ios");

    act(() => result.current.dispensar());

    expect(result.current.estado).toBe("indisponivel");
    expect(localStorage.getItem(CHAVE_DISPENSA)).toBeTruthy();
  });

  it("instalar chama o prompt do Chrome e some quando aceitam", async () => {
    const useInstalacao = await carregarHook();
    const { result } = renderHook(() => useInstalacao());

    const { evento, prompt } = eventoDeInstalacao("accepted");
    act(() => {
      window.dispatchEvent(evento);
    });

    await act(async () => {
      await result.current.instalar();
    });

    expect(prompt).toHaveBeenCalledOnce();
    expect(result.current.estado).toBe("instalada");
    // Aceitou: nada de carimbo de dispensa, não houve dispensa nenhuma.
    expect(localStorage.getItem(CHAVE_DISPENSA)).toBeNull();
  });

  it("recusar no diálogo do Chrome conta como dispensa", async () => {
    // Sem isto o botão continuaria na tela depois da recusa, e o evento já foi
    // consumido: clicar de novo não abriria diálogo nenhum.
    const useInstalacao = await carregarHook();
    const { result } = renderHook(() => useInstalacao());

    const { evento } = eventoDeInstalacao("dismissed");
    act(() => {
      window.dispatchEvent(evento);
    });

    await act(async () => {
      await result.current.instalar();
    });

    expect(result.current.estado).toBe("indisponivel");
    expect(localStorage.getItem(CHAVE_DISPENSA)).toBeTruthy();
  });

  it("some quando o app é instalado por fora do nosso botão", async () => {
    // O menu do próprio navegador também instala, e aí o appinstalled é o
    // único aviso que recebemos.
    const useInstalacao = await carregarHook();
    const { result } = renderHook(() => useInstalacao());

    const { evento } = eventoDeInstalacao("accepted");
    act(() => {
      window.dispatchEvent(evento);
    });
    expect(result.current.estado).toBe("android");

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(result.current.estado).toBe("instalada");
  });

  it("dispensar numa instância apaga o convite nas outras", async () => {
    // A folha pós-login e a faixa do cardápio ficam montadas juntas. Cada uma
    // tem o próprio useState, então a dispensa precisa atravessar as duas.
    comUserAgent(IPHONE);
    const useInstalacao = await carregarHook();
    const folha = renderHook(() => useInstalacao());
    const faixa = renderHook(() => useInstalacao());
    expect(faixa.result.current.estado).toBe("ios");

    act(() => folha.result.current.dispensar());

    expect(faixa.result.current.estado).toBe("indisponivel");
  });

  it("sobrevive a localStorage bloqueado", async () => {
    // Safari em navegação privada lança ao gravar. Um convite de instalação
    // não pode derrubar o cardápio.
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    comUserAgent(IPHONE);

    const useInstalacao = await carregarHook();
    const { result } = renderHook(() => useInstalacao());
    expect(() => act(() => result.current.dispensar())).not.toThrow();
    expect(result.current.estado).toBe("indisponivel");

    Storage.prototype.setItem = original;
  });
});
