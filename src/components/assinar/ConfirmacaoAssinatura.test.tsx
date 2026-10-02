// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { ConfirmacaoAssinatura } from "./ConfirmacaoAssinatura";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ConfirmacaoAssinatura", () => {
  it("restaurante pronto: mostra o endereço e um caminho para criar a senha sem depender do e-mail", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ provisionada: true, nome: "Cantina da Ana", url: "https://cantina.munoapp.com.br" }),
    });

    render(<ConfirmacaoAssinatura inscricaoId="insc-1" />);

    const link = await screen.findByRole("link", { name: /crie sua senha agora/i });
    expect(link.getAttribute("href")).toBe("https://cantina.munoapp.com.br/esqueci-senha");
    expect(screen.getByText(/Pronto, Cantina da Ana/)).toBeTruthy();
  });

  it("enquanto o restaurante não existe, não oferece link para um endereço que talvez responda 404", async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ provisionada: false }) });

    render(<ConfirmacaoAssinatura inscricaoId="insc-1" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: /crie sua senha agora/i })).toBeNull();
    expect(screen.getByText(/Pagamento confirmado/)).toBeTruthy();
  });

  it("sem id na URL a tela continua correta e não consulta nada", () => {
    render(<ConfirmacaoAssinatura />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Pagamento confirmado/)).toBeTruthy();
  });
});
