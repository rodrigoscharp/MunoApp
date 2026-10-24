// @vitest-environment jsdom
/**
 * O acompanhamento do pedido de mesa.
 *
 * Buscava o pedido a cada 10 segundos, de cada celular de cada mesa aberta.
 * Agora o aviso chega pelo canal de tempo real do pedido (useOrderRealtime), e
 * o polling vira reserva a cada 30 segundos, para quando o canal não vier.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

const estado = vi.hoisted(() => ({
  realtime: { status: null as string | null, updatedAt: null as string | null, estimatedDeliveryAt: null },
  intervalo: 0,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "token-8", orderId: "pedido-1" }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/hooks/useOrderRealtime", () => ({
  useOrderRealtime: () => estado.realtime,
}));
vi.mock("@/lib/polling-visivel", () => ({
  iniciarPollingVisivel: (_fn: () => void, ms: number) => {
    estado.intervalo = ms;
    return () => {};
  },
}));

import MesaOrderConfirmationPage from "./page";

const fetchMock = vi.fn();

function pedido(status: string) {
  return new Response(
    JSON.stringify({ id: "pedido-1", status, total: "25", items: [] }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

beforeEach(() => {
  estado.realtime = { status: null, updatedAt: null, estimatedDeliveryAt: null };
  estado.intervalo = 0;
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(pedido("PENDING")));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MesaOrderConfirmationPage", () => {
  it("o polling é reserva, a cada 30 segundos", async () => {
    render(<MesaOrderConfirmationPage />);
    await screen.findByText("Aguardando confirmação");
    expect(estado.intervalo).toBe(30_000);
  });

  it("o aviso de tempo real busca o pedido de novo na hora", async () => {
    const { rerender } = render(<MesaOrderConfirmationPage />);
    await screen.findByText("Aguardando confirmação");

    fetchMock.mockImplementation(() => Promise.resolve(pedido("IN_PREPARATION")));
    estado.realtime = { status: "IN_PREPARATION", updatedAt: "2026-10-24T12:00:00Z", estimatedDeliveryAt: null };
    rerender(<MesaOrderConfirmationPage />);

    await screen.findByText("Em preparo");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
