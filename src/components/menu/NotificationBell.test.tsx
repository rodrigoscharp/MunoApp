// @vitest-environment jsdom
/**
 * O sino do cardápio.
 *
 * A lógica de quando notificar mora no `useOrderNotifications`, que tem suíte
 * própria; aqui o alvo é o que o sino faz com ela — o contador que o cliente vê
 * de relance e, principalmente, **para onde cada aviso leva**. Notificação de
 * chat e de status apontam para telas diferentes, e trocar os dois manda o
 * cliente para o lugar errado no momento em que ele mais quer olhar.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const markAllAsRead = vi.fn();
const markAsRead = vi.fn();
const clearAll = vi.fn();
const estado = vi.fn();

vi.mock("@/hooks/useOrderNotifications", () => ({
  useOrderNotifications: () => estado(),
}));

import { NotificationBell } from "./NotificationBell";

function aviso(over: Record<string, unknown> = {}) {
  return {
    id: "n-1",
    orderId: "pedido-abc123",
    type: "status",
    status: "READY",
    message: "Seu pedido está pronto!",
    description: "Pode vir buscar quando quiser",
    timestamp: new Date().toISOString(),
    read: false,
    ...over,
  };
}

function comAvisos(notifications: Record<string, unknown>[] = [], naoLidas?: number) {
  estado.mockReturnValue({
    notifications,
    unreadCount: naoLidas ?? notifications.filter((n) => !n.read).length,
    markAllAsRead,
    markAsRead,
    clearAll,
  });
}

const sino = () => screen.getByRole("button", { name: /notificações de pedido/i });

beforeEach(() => {
  markAllAsRead.mockClear();
  markAsRead.mockClear();
  clearAll.mockClear();
  comAvisos([]);
});

afterEach(() => {
  cleanup();
});

describe("o contador", () => {
  it("não mostra nada quando está tudo lido", () => {
    comAvisos([aviso({ read: true })]);
    render(<NotificationBell />);

    expect(within(sino()).queryByText(/\d/)).toBeNull();
  });

  it("mostra quantas não lidas existem", () => {
    comAvisos([aviso(), aviso({ id: "n-2" })]);
    render(<NotificationBell />);

    expect(within(sino()).getByText("2")).toBeDefined();
  });

  it("para de contar em 9+", () => {
    comAvisos([aviso()], 12);
    render(<NotificationBell />);

    expect(within(sino()).getByText("9+")).toBeDefined();
  });
});

describe("abrir o painel", () => {
  it("mostra a lista ao tocar no sino", async () => {
    comAvisos([aviso()]);
    render(<NotificationBell />);

    await userEvent.click(sino());

    expect(screen.getByText("Seu pedido está pronto!")).toBeDefined();
  });

  it("marca tudo como lido ao abrir", async () => {
    comAvisos([aviso()]);
    render(<NotificationBell />);

    await userEvent.click(sino());

    expect(markAllAsRead).toHaveBeenCalled();
  });

  it("não chama a marcação quando já estava tudo lido", async () => {
    comAvisos([aviso({ read: true })]);
    render(<NotificationBell />);

    await userEvent.click(sino());

    expect(markAllAsRead).not.toHaveBeenCalled();
  });

  it("fecha ao tocar no sino de novo", async () => {
    comAvisos([aviso()]);
    render(<NotificationBell />);

    await userEvent.click(sino());
    await userEvent.click(sino());

    expect(screen.queryByText("Seu pedido está pronto!")).toBeNull();
  });

  it("fecha ao clicar fora", async () => {
    comAvisos([aviso()]);
    render(<NotificationBell />);
    await userEvent.click(sino());

    await userEvent.click(document.body);

    expect(screen.queryByText("Seu pedido está pronto!")).toBeNull();
  });

  it("avisa quando não há nada para mostrar", async () => {
    comAvisos([]);
    render(<NotificationBell />);

    await userEvent.click(sino());

    expect(screen.getByText(/nenhuma notificação/i)).toBeDefined();
  });
});

describe("para onde cada aviso leva", () => {
  it("aviso de status vai para o acompanhamento do pedido", async () => {
    comAvisos([aviso({ type: "status" })]);
    render(<NotificationBell />);
    await userEvent.click(sino());

    const link = screen.getByRole("link", { name: /pronto/i });
    expect(link.getAttribute("href")).toBe("/track/pedido-abc123");
  });

  it("aviso de chat vai para a conversa do pedido", async () => {
    comAvisos([
      aviso({ type: "chat", message: "Mensagem do restaurante", description: "já saiu" }),
    ]);
    render(<NotificationBell />);
    await userEvent.click(sino());

    const link = screen.getByRole("link", { name: /mensagem do restaurante/i });
    expect(link.getAttribute("href")).toBe("/pedidos/pedido-abc123/chat");
  });

  it("marca o aviso como lido e fecha ao segui-lo", async () => {
    comAvisos([aviso()]);
    render(<NotificationBell />);
    await userEvent.click(sino());

    await userEvent.click(screen.getByRole("link", { name: /pronto/i }));

    expect(markAsRead).toHaveBeenCalledWith("n-1");
    expect(screen.queryByText("Seu pedido está pronto!")).toBeNull();
  });
});

describe("o conteúdo do aviso", () => {
  it("mostra mensagem e subtítulo", async () => {
    comAvisos([aviso()]);
    render(<NotificationBell />);
    await userEvent.click(sino());

    expect(screen.getByText("Seu pedido está pronto!")).toBeDefined();
    expect(screen.getByText("Pode vir buscar quando quiser")).toBeDefined();
  });

  it("mostra há quanto tempo chegou", async () => {
    comAvisos([aviso({ timestamp: new Date(Date.now() - 3 * 60 * 60_000).toISOString() })]);
    render(<NotificationBell />);
    await userEvent.click(sino());

    expect(screen.getByText("há 3h")).toBeDefined();
  });

  it("destaca o aviso ainda não lido", async () => {
    // Chegou com o painel já aberto: é o único caso em que o cliente vê a marca,
    // já que abrir o sino marca tudo como lido.
    comAvisos([aviso({ read: false })]);
    render(<NotificationBell />);
    await userEvent.click(sino());

    expect(screen.getByText("Seu pedido está pronto!").className).toMatch(/font-semibold/);
  });
});

describe("limpar", () => {
  it("oferece limpar quando há avisos", async () => {
    comAvisos([aviso()]);
    render(<NotificationBell />);
    await userEvent.click(sino());

    await userEvent.click(screen.getByRole("button", { name: /limpar/i }));

    expect(clearAll).toHaveBeenCalled();
  });

  it("não oferece limpar com a lista vazia", async () => {
    comAvisos([]);
    render(<NotificationBell />);
    await userEvent.click(sino());

    expect(screen.queryByRole("button", { name: /limpar/i })).toBeNull();
  });
});
