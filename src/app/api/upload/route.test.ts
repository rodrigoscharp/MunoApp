import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const authPlatform = vi.fn();
vi.mock("@/lib/auth-platform", () => ({ authPlatform: () => authPlatform() }));

const upload = vi.fn();
const getPublicUrl = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => upload(...args),
        getPublicUrl: (...args: unknown[]) => getPublicUrl(...args),
      }),
    },
  },
}));

const { POST } = await import("@/app/api/upload/route");

function arquivo(nome = "logo.png", tipo = "image/png"): File {
  return new File([new Uint8Array([1, 2, 3])], nome, { type: tipo });
}

function requisicao(file: File | null): NextRequest {
  const fd = new FormData();
  if (file) fd.append("file", file);
  return new NextRequest("http://localhost/api/upload", {
    method: "POST",
    body: fd,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue(null);
  authPlatform.mockResolvedValue(null);
  upload.mockResolvedValue({ error: null });
  getPublicUrl.mockReturnValue({
    data: { publicUrl: "https://cdn.example/logo.png" },
  });
});

describe("POST /api/upload", () => {
  it("aceita sessão de tenant ADMIN (comportamento atual)", async () => {
    auth.mockResolvedValue({ user: { role: "ADMIN" } });

    const res = await POST(requisicao(arquivo()));

    expect(res.status).toBe(200);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("aceita sessão de plataforma, sem sessão de tenant", async () => {
    authPlatform.mockResolvedValue({ user: { id: "admin-1" } });

    const res = await POST(requisicao(arquivo()));

    expect(res.status).toBe(200);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("recusa sem nenhuma das duas sessões", async () => {
    const res = await POST(requisicao(arquivo()));

    expect(res.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
  });

  it("recusa sessão de tenant que não é ADMIN e sem sessão de plataforma", async () => {
    auth.mockResolvedValue({ user: { role: "GARCOM" } });

    const res = await POST(requisicao(arquivo()));

    expect(res.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("POST /api/upload com corpo que não é multipart", () => {
  // req.formData() lança TypeError quando o Content-Type não é multipart, e a
  // chamada não estava protegida: a rota respondia 500, escondendo o que na
  // verdade é um pedido malformado.
  it("responde 400 em vez de 500", async () => {
    auth.mockResolvedValue({ user: { role: "ADMIN" } });

    const res = await POST(
      new NextRequest("http://localhost/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: "nem tento" }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("não deixa o corpo malformado passar por cima da autorização", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    );

    expect(res.status).toBe(403);
  });
});
