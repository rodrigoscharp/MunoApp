// @vitest-environment jsdom
/**
 * A lista de conversas do /adm/chats. A conversa em si é da ChatWindow, que
 * tem os testes dela; aqui fica o que a lista promete: quem espera resposta,
 * e abrir a conversa que o detalhe do pedido pediu.
 */

import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/polling-visivel", () => ({ iniciarPollingVisivel: () => () => {} }));
vi.mock("@/hooks/useChat", () => ({ prefetchChat: vi.fn() }));
vi.mock("@/components/chat/OrderStatusBadge", () => ({ OrderStatusBadge: () => null }));
vi.mock("@/components/chat/ChatWindow", () => ({
  ChatWindow: ({ orderId }: { orderId: string }) => <div data-testid="conversa">{orderId}</div>,
}));

import { AdminChatsClient } from "./AdminChatsClient";

function conversa(id: string, senderRole: string, over: Record<string, unknown> = {}) {
  return {
    id,
    status: "PENDING",
    deliveryType: "DELIVERY",
    customerName: null,
    updatedAt: new Date("2026-08-29T12:00:00Z"),
    user: { name: "Ana", email: "a@x" },
    chatMessages: [
      { id: `m-${id}`, senderRole, content: "Vai demorar?", createdAt: new Date("2026-08-29T12:00:00Z") },
    ],
    ...over,
  };
}

afterEach(() => cleanup());

describe("a lista de conversas", () => {
  it("marca a conversa em que a última palavra é do cliente", () => {
    render(
      <AdminChatsClient
        orders={[conversa("pedido-aaaaa1", "CUSTOMER"), conversa("pedido-bbbbb2", "ADMIN")]}
        adminName="Loja"
      />
    );
    const lista = screen.getByRole("complementary", { name: "Conversas" });
    const primeira = within(lista).getByText("#AAAAA1").closest("button")!;
    const segunda = within(lista).getByText("#BBBBB2").closest("button")!;

    expect(within(primeira).getByText("Aguardando resposta")).toBeDefined();
    expect(within(segunda).queryByText("Aguardando resposta")).toBeNull();
    expect(within(segunda).getByText(/Você:/)).toBeDefined();
    expect(screen.getByText(/2 conversas · 1 aguardando resposta/i)).toBeDefined();
  });

  it("abre a conversa pedida pelo detalhe do pedido", () => {
    render(
      <AdminChatsClient
        orders={[conversa("pedido-aaaaa1", "CUSTOMER"), conversa("pedido-bbbbb2", "ADMIN")]}
        adminName="Loja"
        pedidoInicial="pedido-bbbbb2"
      />
    );
    expect(screen.getByTestId("conversa").textContent).toBe("pedido-bbbbb2");
  });

  it("ignora pedido que não está na lista e abre a primeira", () => {
    render(
      <AdminChatsClient orders={[conversa("pedido-aaaaa1", "CUSTOMER")]} adminName="Loja" pedidoInicial="de-outro" />
    );
    expect(screen.getByTestId("conversa").textContent).toBe("pedido-aaaaa1");
  });

  it("na mesa, mostra o nome digitado no pedido", () => {
    render(
      <AdminChatsClient
        orders={[conversa("pedido-aaaaa1", "CUSTOMER", { deliveryType: "DINE_IN", customerName: "João" })]}
        adminName="Loja"
      />
    );
    const lista = screen.getByRole("complementary", { name: "Conversas" });
    expect(within(lista).getByText("João")).toBeDefined();
  });
});
