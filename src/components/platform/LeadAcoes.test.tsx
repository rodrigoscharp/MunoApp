// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LeadAcoes } from "./LeadAcoes";

// O lead de checkout tem o estágio derivado dos fatos: os botões de status
// somem, mas a anotação continua, porque é nela que fica "conversei, ela
// pediu para eu voltar em janeiro" — o tipo de registro que só existe em
// texto, nunca em evento.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LeadAcoes", () => {
  it("mostra os botões de status quando podeMoverStatus não é passado", () => {
    render(<LeadAcoes leadId="l1" statusAtual="NOVO" />);

    expect(screen.getByRole("button", { name: "Contatado" })).toBeTruthy();
  });

  it("esconde os botões de status e mantém a anotação quando podeMoverStatus é falso", () => {
    render(<LeadAcoes leadId="l1" statusAtual="NOVO" podeMoverStatus={false} />);

    expect(screen.queryByRole("button", { name: "Contatado" })).toBeNull();
    expect(
      screen.getByPlaceholderText(/anotar algo sobre este lead/i)
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anotar" })).toBeTruthy();
  });
});
