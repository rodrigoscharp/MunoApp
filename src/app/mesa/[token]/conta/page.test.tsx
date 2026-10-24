// @vitest-environment jsdom
/**
 * A conta da mesa.
 *
 * A conta muda quando alguém da mesa pede, o que acontece em minutos, não em
 * segundos: buscar a cada 10s em cada celular aberto era custo sem ganho. O
 * intervalo passou a 20s.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const estado = vi.hoisted(() => ({ intervalo: 0 }));

vi.mock("next/navigation", () => ({ useParams: () => ({ token: "token-8" }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/lib/polling-visivel", () => ({
  iniciarPollingVisivel: (_fn: () => void, ms: number) => {
    estado.intervalo = ms;
    return () => {};
  },
}));

import MesaContaPage from "./page";

beforeEach(() => {
  estado.intervalo = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ table: { number: 8, name: null }, orders: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    )
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MesaContaPage", () => {
  it("atualiza a conta a cada 20 segundos", async () => {
    render(<MesaContaPage />);
    await screen.findAllByText(/mesa 8/i);
    expect(estado.intervalo).toBe(20_000);
  });
});
