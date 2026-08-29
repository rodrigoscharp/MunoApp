// @vitest-environment jsdom
/**
 * O chat entre cliente e restaurante.
 *
 * O envio é otimista: a bolha aparece antes de o servidor responder, e depois
 * troca de estado — enviando, enviada, ou falha com opção de reenviar. É esse
 * ciclo que os testes atacam, porque é onde uma mensagem pode aparecer duas
 * vezes ou nenhuma.
 *
 * O hook roda de verdade; só Supabase e `fetch` são dublês.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase", () => {
  const canal = { on: () => canal, subscribe: () => canal };
  return { supabase: { channel: () => canal, removeChannel: vi.fn() } };
});

import { ChatWindow } from "./ChatWindow";

const ORDER_ID = "pedido-abc123";
const fetchMock = vi.fn();

function mensagem(over: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    orderId: ORDER_ID,
    senderRole: "ADMIN",
    senderId: "admin-1",
    senderName: "Loja",
    content: "seu pedido saiu",
    createdAt: new Date().toISOString(),
    ...over,
  };
}

/** Histórico devolvido pelo GET; o POST responde conforme `postOk`. */
let historico: Record<string, unknown>[] = [];
let postOk = true;
let contadorPost = 0;

function servidor() {
  fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      contadorPost += 1;
      const corpo = JSON.parse(String(init.body));
      if (!postOk) return Promise.resolve({ ok: false, json: async () => ({}) });
      return Promise.resolve({
        ok: true,
        json: async () => mensagem({ id: `confirmada-${contadorPost}`, senderRole: "CUSTOMER", content: corpo.content }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => historico });
  });
}

async function montar(props: Record<string, unknown> = {}) {
  servidor();
  const r = render(
    <ChatWindow
      orderId={ORDER_ID}
      tenantId="restaurante-a"
      currentRole="CUSTOMER"
      currentName="Ana"
      {...props}
    />
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  return r;
}

async function escrever(texto: string) {
  await userEvent.type(screen.getByPlaceholderText(/mensagem|escreva aqui/i), texto);
}

const botaoEnviar = () => screen.getByRole("button", { name: "" }) as HTMLButtonElement;

beforeEach(() => {
  historico = [];
  postOk = true;
  contadorPost = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // O jsdom não implementa scrollIntoView, e o chat rola até a última mensagem
  // a cada render. Sem o stub, o efeito derruba o componente inteiro.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a conversa", () => {
  it("mostra o histórico do pedido", async () => {
    historico = [mensagem({ content: "seu pedido saiu" })];
    await montar();

    expect(await screen.findByText("seu pedido saiu")).toBeDefined();
  });

  it("avisa quando ainda não há mensagem", async () => {
    await montar();
    expect(await screen.findByText(/nenhuma mensagem ainda/i)).toBeDefined();
  });

  it("identifica quem falou do outro lado", async () => {
    historico = [mensagem({ senderRole: "ADMIN" })];
    await montar({ currentRole: "CUSTOMER" });

    expect(await screen.findByText("Restaurante")).toBeDefined();
  });

  it("busca o histórico do pedido certo", async () => {
    await montar();
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/orders/${ORDER_ID}/chat`);
  });
});

describe("enviar mensagem", () => {
  it("não envia texto em branco", async () => {
    await montar();
    await escrever("   ");

    expect(botaoEnviar().disabled).toBe(true);
  });

  it("manda o conteúdo digitado", async () => {
    await montar();
    await escrever("cadê meu pedido?");
    await userEvent.click(botaoEnviar());

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === "POST");
      expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
        content: "cadê meu pedido?",
      });
    });
  });

  it("mostra a mensagem na hora, antes da resposta do servidor", async () => {
    await montar();
    await escrever("oi");
    await userEvent.click(botaoEnviar());

    expect(await screen.findByText("oi")).toBeDefined();
  });

  it("limpa o campo depois de enviar", async () => {
    await montar();
    await escrever("oi");
    await userEvent.click(botaoEnviar());

    await waitFor(() =>
      expect((screen.getByPlaceholderText(/mensagem/i) as HTMLTextAreaElement).value).toBe("")
    );
  });

  it("não limpa o campo quando o envio falha", async () => {
    // O texto é do cliente; apagá-lo numa falha é perder o que ele escreveu.
    postOk = false;
    await montar();
    await escrever("oi");
    await userEvent.click(botaoEnviar());

    await waitFor(() =>
      expect((screen.getByPlaceholderText(/mensagem/i) as HTMLTextAreaElement).value).toBe("oi")
    );
  });
});

describe("quando o envio falha", () => {
  beforeEach(() => {
    postOk = false;
  });

  it("marca a mensagem e oferece reenviar", async () => {
    await montar();
    await escrever("oi");
    await userEvent.click(botaoEnviar());

    expect(await screen.findByRole("button", { name: /toque para reenviar/i })).toBeDefined();
  });

  it("reenvia o mesmo conteúdo ao tocar", async () => {
    await montar();
    await escrever("oi");
    await userEvent.click(botaoEnviar());
    const reenviar = await screen.findByRole("button", { name: /toque para reenviar/i });

    postOk = true;
    await userEvent.click(reenviar);

    await waitFor(() => expect(contadorPost).toBe(2));
  });

  it("não deixa a mensagem duplicada na tela depois de reenviar", async () => {
    // A bolha da falha precisa dar lugar à nova. Sem isso o cliente vê o mesmo
    // texto duas vezes, um em vermelho dizendo que falhou e outro entregue — e
    // a bolha vermelha sobrevive a todo polling, porque o merge preserva
    // `failed` para sempre.
    await montar();
    await escrever("oi");
    await userEvent.click(botaoEnviar());
    const reenviar = await screen.findByRole("button", { name: /toque para reenviar/i });

    postOk = true;
    await userEvent.click(reenviar);

    await waitFor(() => expect(contadorPost).toBe(2));
    // `ignore` exclui o textarea, que continua com o texto porque o campo não é
    // limpo numa falha — o que se conta aqui são bolhas na conversa.
    await waitFor(() =>
      expect(screen.getAllByText("oi", { ignore: "textarea" })).toHaveLength(1)
    );
  });

  it("some o aviso de falha depois de um reenvio bem-sucedido", async () => {
    await montar();
    await escrever("oi");
    await userEvent.click(botaoEnviar());
    const reenviar = await screen.findByRole("button", { name: /toque para reenviar/i });

    postOk = true;
    await userEvent.click(reenviar);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /toque para reenviar/i })).toBeNull()
    );
  });
});

describe("as respostas rápidas", () => {
  // O label é quebrado em emoji + texto pelo componente; o primeiro token vira
  // o ícone, então o rótulo precisa começar por um.
  const atalhos = [{ label: "🛵 Cadê meu pedido?", message: "Cadê meu pedido?" }];

  it("aparecem para o cliente que ainda não falou", async () => {
    await montar({ currentRole: "CUSTOMER", quickReplies: atalhos });
    expect(await screen.findByText("Cadê meu pedido?")).toBeDefined();
  });

  it("não aparecem para o restaurante", async () => {
    await montar({ currentRole: "ADMIN", quickReplies: atalhos });
    await waitFor(() => expect(screen.queryByText("Cadê meu pedido?")).toBeNull());
  });

  it("somem depois que o cliente já escreveu", async () => {
    historico = [mensagem({ senderRole: "CUSTOMER", content: "oi" })];
    await montar({ currentRole: "CUSTOMER", quickReplies: atalhos });

    await waitFor(() => expect(screen.queryByText("Cadê meu pedido?")).toBeNull());
  });

  it("enviam a mensagem do atalho", async () => {
    await montar({ currentRole: "CUSTOMER", quickReplies: atalhos });
    await userEvent.click(await screen.findByText("Cadê meu pedido?"));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === "POST");
      expect(JSON.parse(String((post![1] as RequestInit).body)).content).toBe("Cadê meu pedido?");
    });
  });
});
