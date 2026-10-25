// @vitest-environment jsdom
/**
 * O bloco de pagamento do Pix: o QR (quando o gateway manda) e o
 * copia-e-cola, que é o caminho de quem abriu a página no próprio celular.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PixPayment } from "./PixPayment";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PixPayment", () => {
  it("mostra o QR e o código", () => {
    render(<PixPayment qrSrc="data:image/png;base64,AAA" copyPaste="000201pix" />);

    expect(screen.getByRole("heading", { name: "Pague com Pix" })).toBeDefined();
    expect(screen.getByAltText("QR Code Pix")).toBeDefined();
    expect(screen.getByText("000201pix")).toBeDefined();
  });

  it("sem QR, pede para copiar o código", () => {
    render(<PixPayment qrSrc={null} copyPaste="000201pix" />);

    expect(screen.queryByAltText("QR Code Pix")).toBeNull();
    expect(screen.getByText(/copie o código abaixo e pague/i)).toBeDefined();
  });

  it("copia o código e avisa que copiou", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<PixPayment qrSrc={null} copyPaste="000201pix" />);

    fireEvent.click(screen.getByRole("button", { name: "Copiar" }));

    expect(await screen.findByText("Copiado!")).toBeDefined();
    expect(writeText).toHaveBeenCalledWith("000201pix");
  });
});
