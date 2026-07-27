import { describe, expect, it } from "vitest";
import { toQrImageSrc } from "@/lib/pix-qr";

describe("toQrImageSrc", () => {
  it("prefixa base64 cru (Mercado Pago, Asaas)", () => {
    expect(toQrImageSrc("iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  it("não prefixa duas vezes quando o gateway já manda data URI (Abacate Pay)", () => {
    const dataUri = "data:image/png;base64,iVBORw0KGgo=";

    expect(toQrImageSrc(dataUri)).toBe(dataUri);
  });

  it("aceita URL de imagem hospedada pelo gateway (PagBank)", () => {
    const url = "https://sandbox.api.pagseguro.com/qrcode/QRCO_123.png";

    expect(toQrImageSrc(url)).toBe(url);
  });

  it("aceita http além de https", () => {
    expect(toQrImageSrc("http://exemplo/qr.png")).toBe("http://exemplo/qr.png");
  });

  it("devolve null quando não há QR", () => {
    expect(toQrImageSrc(undefined)).toBeNull();
    expect(toQrImageSrc("")).toBeNull();
    expect(toQrImageSrc("   ")).toBeNull();
  });

  it("recusa esquema que não é imagem, pra não virar vetor de injeção", () => {
    // Se um gateway comprometido mandasse javascript:, isso viraria o src
    // de uma <img> na página do cliente.
    expect(toQrImageSrc("javascript:alert(1)")).toBeNull();
    expect(toQrImageSrc("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
  });
});
