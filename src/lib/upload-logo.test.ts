import { describe, expect, it, vi, beforeEach } from "vitest";
import { uploadLogo } from "./upload-logo";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("uploadLogo", () => {
  it("envia o arquivo em multipart para /api/upload e devolve a URL pública", async () => {
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://cdn.example/logo.png" }),
    });

    const url = await uploadLogo(
      new File(["x"], "logo.png", { type: "image/png" })
    );

    expect(url).toBe("https://cdn.example/logo.png");
    const [rota, opcoes] = mockFetch.mock.calls[0];
    expect(rota).toBe("/api/upload");
    expect(opcoes.method).toBe("POST");
    expect(opcoes.body).toBeInstanceOf(FormData);
  });

  it("lança erro quando a resposta não é ok", async () => {
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });

    await expect(
      uploadLogo(new File(["x"], "logo.png", { type: "image/png" }))
    ).rejects.toThrow();
  });
});
