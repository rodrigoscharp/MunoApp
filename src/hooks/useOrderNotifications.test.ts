// @vitest-environment jsdom
/**
 * O sino de notificações do cliente.
 *
 * Duas fontes alimentam o mesmo sino: o Broadcast em `user:<id>`, que entrega a
 * mudança na hora, e o polling de 60s, que é rede de segurança. As duas podem
 * falar do mesmo fato, então a regra que sustenta o sino é a **deduplicação** —
 * e é isso que estes testes atacam, junto com a outra regra que não aparece no
 * caminho feliz: pedido ainda desconhecido é registrado sem notificar, senão o
 * cliente recebe um aviso do pedido que ele mesmo acabou de fazer.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const sessao = vi.fn();
vi.mock("next-auth/react", () => ({ useSession: () => sessao() }));

const toastInfo = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign(
    (...a: unknown[]) => toastInfo(...a),
    { info: (...a: unknown[]) => toastInfo(...a), error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) }
  ),
}));

/** Handlers registrados no canal, por evento, para o teste disparar na mão. */
const handlers: Record<string, (msg: { payload: Record<string, unknown> }) => void> = {};
const removeChannel = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: () => {
      const canal = {
        on: (_tipo: string, { event }: { event: string }, cb: (m: { payload: Record<string, unknown> }) => void) => {
          handlers[event] = cb;
          return canal;
        },
        subscribe: () => canal,
      };
      return canal;
    },
    removeChannel: (...a: unknown[]) => removeChannel(...a),
  },
}));

import { useOrderNotifications } from "./useOrderNotifications";

const fetchMock = vi.fn();

const USUARIO = "cliente-1";
const TENANT = "restaurante-a";

/** Respostas de /api/orders e /api/chat/unread conforme a URL pedida. */
function servidor({
  pedidos = [] as { id: string; status: string; deliveryType: string }[],
  chat = [] as { id: string; orderId: string; content: string; createdAt: string }[],
} = {}) {
  fetchMock.mockImplementation((url: string) => {
    const u = String(url);
    if (!u.startsWith("/api/chat/unread")) {
      return Promise.resolve({ ok: true, json: async () => pedidos });
    }
    // O `since` é respeitado como a rota faz (`createdAt: { gt: desde }`).
    // Sem isso o mock não distingue a busca que já avançou o cursor da que
    // ainda não avançou — que é exatamente a janela onde o bug mora.
    const since = new URL(u, "http://localhost").searchParams.get("since");
    const corte = since ? new Date(since).getTime() : 0;
    const filtradas = chat.filter((m) => new Date(m.createdAt).getTime() > corte);
    return Promise.resolve({ ok: true, json: async () => filtradas });
  });
}

/** Monta o hook e espera o initStatuses terminar. */
async function montar() {
  const r = renderHook(() => useOrderNotifications());
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/orders"));
  return r;
}

/**
 * O cursor de chat comeca em "agora" para nao notificar historico ao abrir o
 * app; mensagem de teste precisa ser posterior a isso.
 */
const daquiAPouco = () => new Date(Date.now() + 60_000).toISOString();

function disparar(evento: string, payload: Record<string, unknown>) {
  act(() => handlers[evento]?.({ payload }));
}

beforeEach(() => {
  Object.keys(handlers).forEach((k) => delete handlers[k]);
  fetchMock.mockReset();
  toastInfo.mockClear();
  toastError.mockClear();
  toastSuccess.mockClear();
  removeChannel.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  sessao.mockReturnValue({ data: { user: { id: USUARIO, tenantId: TENANT } } });
  servidor();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sem cliente logado", () => {
  it("não busca nada nem assina canal", async () => {
    sessao.mockReturnValue({ data: null });
    renderHook(() => useOrderNotifications());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(handlers["order-updated"]).toBeUndefined();
  });

  it("também não faz nada sem tenant na sessão", () => {
    sessao.mockReturnValue({ data: { user: { id: USUARIO } } });
    renderHook(() => useOrderNotifications());

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("mudança de status pelo Broadcast", () => {
  beforeEach(() => {
    servidor({ pedidos: [{ id: "pedido-1", status: "CONFIRMED", deliveryType: "DELIVERY" }] });
  });

  it("não avisa sobre pedido que ainda não conhecia", async () => {
    // O cliente acabou de criar o pedido; avisá-lo disso é ruído.
    const { result } = await montar();
    disparar("order-updated", { orderId: "pedido-novo", status: "PENDING", deliveryType: "PICKUP" });

    expect(result.current.notifications).toHaveLength(0);
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it("avisa quando o status muda", async () => {
    const { result } = await montar();
    disparar("order-updated", { orderId: "pedido-1", status: "READY", deliveryType: "DELIVERY" });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.notifications[0]).toMatchObject({
      orderId: "pedido-1",
      type: "status",
      status: "READY",
      read: false,
    });
  });

  it("ignora repetição do mesmo status", async () => {
    const { result } = await montar();
    disparar("order-updated", { orderId: "pedido-1", status: "READY", deliveryType: "DELIVERY" });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    disparar("order-updated", { orderId: "pedido-1", status: "READY", deliveryType: "DELIVERY" });

    expect(result.current.notifications).toHaveLength(1);
  });

  it("usa o deliveryType já conhecido quando o evento não manda um", async () => {
    const { result } = await montar();
    disparar("order-updated", { orderId: "pedido-1", status: "READY" });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    // DELIVERY: "saiu para entrega". Sem o fallback viria a mensagem de retirada.
    expect(result.current.notifications[0].message).toMatch(/entrega/i);
  });

  it("escolhe o tom do toast pelo status", async () => {
    await montar();

    disparar("order-updated", { orderId: "pedido-1", status: "DELIVERED", deliveryType: "DELIVERY" });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());

    disparar("order-updated", { orderId: "pedido-1", status: "CANCELLED", deliveryType: "DELIVERY" });
    await waitFor(() => expect(toastError).toHaveBeenCalled());
  });
});

describe("as mensagens mudam com o tipo de entrega", () => {
  it.each([
    ["DELIVERY", /saiu para entrega/i],
    ["DINE_IN", /caminho da mesa/i],
    ["PICKUP", /pronto para retirada/i],
  ])("READY em %s fala a língua certa", async (deliveryType, esperado) => {
    servidor({ pedidos: [{ id: "pedido-1", status: "CONFIRMED", deliveryType }] });
    const { result } = await montar();

    disparar("order-updated", { orderId: "pedido-1", status: "READY", deliveryType });

    await waitFor(() => expect(result.current.notifications[0].message).toMatch(esperado));
  });
});

describe("mensagens de chat", () => {
  beforeEach(() => {
    servidor({
      pedidos: [{ id: "pedido-1", status: "CONFIRMED", deliveryType: "DELIVERY" }],
      chat: [
        {
          id: "msg-1",
          orderId: "pedido-1",
          content: "seu pedido saiu",
          createdAt: daquiAPouco(),
        },
      ],
    });
  });

  it("ignora eco da mensagem do próprio cliente", async () => {
    await montar();
    fetchMock.mockClear();

    disparar("chat-message", { senderRole: "CUSTOMER", orderId: "pedido-1" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("busca e notifica quando quem falou foi o restaurante", async () => {
    const { result } = await montar();
    disparar("chat-message", { senderRole: "ADMIN", orderId: "pedido-1" });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.notifications[0]).toMatchObject({
      type: "chat",
      orderId: "pedido-1",
      description: "seu pedido saiu",
    });
  });

  it("encurta mensagem longa no subtítulo", async () => {
    servidor({
      pedidos: [{ id: "pedido-1", status: "CONFIRMED", deliveryType: "DELIVERY" }],
      chat: [
        {
          id: "msg-1",
          orderId: "pedido-1",
          content: "a".repeat(100),
          createdAt: daquiAPouco(),
        },
      ],
    });
    const { result } = await montar();
    disparar("chat-message", { senderRole: "ADMIN", orderId: "pedido-1" });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.notifications[0].description).toHaveLength(58);
    expect(result.current.notifications[0].description.endsWith("…")).toBe(true);
  });

  it("não avisa duas vezes da mesma mensagem", async () => {
    // Duas mensagens seguidas do restaurante disparam dois `fetchChatMessages`
    // antes de o cursor avançar: os dois trazem msg-1 e chamam a notificação.
    const { result } = await montar();

    disparar("chat-message", { senderRole: "ADMIN", orderId: "pedido-1" });
    disparar("chat-message", { senderRole: "ADMIN", orderId: "pedido-1" });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(toastInfo).toHaveBeenCalledTimes(1);
  });
});

describe("a lista do sino", () => {
  beforeEach(() => {
    servidor({ pedidos: [{ id: "pedido-1", status: "CONFIRMED", deliveryType: "DELIVERY" }] });
  });

  async function comDuasNotificacoes() {
    const r = await montar();
    disparar("order-updated", { orderId: "pedido-1", status: "READY", deliveryType: "DELIVERY" });
    await waitFor(() => expect(r.result.current.notifications).toHaveLength(1));
    disparar("order-updated", { orderId: "pedido-1", status: "DELIVERED", deliveryType: "DELIVERY" });
    await waitFor(() => expect(r.result.current.notifications).toHaveLength(2));
    return r;
  }

  it("põe a mais recente no topo", async () => {
    const { result } = await comDuasNotificacoes();
    expect(result.current.notifications[0].status).toBe("DELIVERED");
  });

  it("conta as não lidas", async () => {
    const { result } = await comDuasNotificacoes();
    expect(result.current.unreadCount).toBe(2);
  });

  it("marca uma como lida", async () => {
    const { result } = await comDuasNotificacoes();
    act(() => result.current.markAsRead(result.current.notifications[0].id));

    expect(result.current.unreadCount).toBe(1);
  });

  it("marca todas como lidas", async () => {
    const { result } = await comDuasNotificacoes();
    act(() => result.current.markAllAsRead());

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications).toHaveLength(2);
  });

  it("limpa a lista", async () => {
    const { result } = await comDuasNotificacoes();
    act(() => result.current.clearAll());

    expect(result.current.notifications).toEqual([]);
  });
});

describe("o histórico sobrevive ao refresh", () => {
  it("grava no localStorage", async () => {
    servidor({ pedidos: [{ id: "pedido-1", status: "CONFIRMED", deliveryType: "DELIVERY" }] });
    const { result } = await montar();
    disparar("order-updated", { orderId: "pedido-1", status: "READY", deliveryType: "DELIVERY" });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    const guardado = JSON.parse(localStorage.getItem("muno-order-notifications")!);
    expect(guardado[0]).toMatchObject({ orderId: "pedido-1", status: "READY" });
  });

  it("carrega o que estava guardado", async () => {
    localStorage.setItem(
      "muno-order-notifications",
      JSON.stringify([
        { id: "n1", orderId: "pedido-9", type: "status", status: "READY", message: "m", description: "d", timestamp: "2026-08-29T00:00:00.000Z", read: false },
      ])
    );

    const { result } = await montar();

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.unreadCount).toBe(1);
  });

  it("não quebra com localStorage corrompido", async () => {
    localStorage.setItem("muno-order-notifications", "{isto não é json");
    const { result } = await montar();

    expect(result.current.notifications).toEqual([]);
  });
});

describe("limpeza ao desmontar", () => {
  it("cancela a assinatura do canal", async () => {
    const { unmount } = await montar();
    unmount();

    expect(removeChannel).toHaveBeenCalled();
  });
});
