// @vitest-environment jsdom
/**
 * A tela de boas-vindas da mesa e a mesa guardada na aba.
 *
 * A tela era um componente de cliente que buscava de novo, em
 * /api/tables/token, a mesa que o layout acabara de ler no servidor, só para
 * guardá-la na aba. Agora o layout entrega a mesa já lida a uma ilha mínima
 * (MesaDaAba), e a página é servidor puro.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import MesaLandingPage from "./page";
import { MesaDaAba } from "@/components/mesa/MesaDaAba";

const fetchMock = vi.fn();

beforeEach(() => {
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MesaLandingPage", () => {
  it("é componente de servidor", () => {
    const fonte = readFileSync(join(__dirname, "page.tsx"), "utf8");
    expect(fonte).not.toMatch(/^\s*["']use client["']/m);
  });

  it("leva ao cardápio da mesa sem buscar nada", async () => {
    render(await MesaLandingPage({ params: Promise.resolve({ token: "token-8" }) }));

    const link = screen.getByRole("link", { name: /ver cardápio/i });
    expect(link.getAttribute("href")).toBe("/mesa/token-8/cardapio");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("MesaDaAba", () => {
  it("guarda na aba a mesa que o servidor leu", () => {
    render(<MesaDaAba tableId="id-8" tableNumber={8} tableName="Varanda" tableToken="token-8" />);

    expect(JSON.parse(sessionStorage.getItem("muno-table")!)).toEqual({
      tableId: "id-8",
      tableNumber: 8,
      tableName: "Varanda",
      tableToken: "token-8",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("o QR de outra mesa substitui o que estava guardado", () => {
    sessionStorage.setItem(
      "muno-table",
      JSON.stringify({ tableId: "id-3", tableNumber: 3, tableName: null, tableToken: "token-3" })
    );
    render(<MesaDaAba tableId="id-8" tableNumber={8} tableName={null} tableToken="token-8" />);

    expect(JSON.parse(sessionStorage.getItem("muno-table")!).tableToken).toBe("token-8");
  });
});
