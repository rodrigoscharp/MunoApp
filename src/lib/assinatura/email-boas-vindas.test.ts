import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// --- mocks -------------------------------------------------------------
//
// Nenhum destes três é I/O de verdade: o token é gravado via
// prismaUnscoped (mockado), o e-mail sai via Resend (mockado), e a URL do
// restaurante é pura (mas mockada aqui para controlar exatamente o host
// que aparece no link, sem depender de ROOT_DOMAIN no ambiente de teste).

const tokenCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    passwordResetToken: {
      create: (...args: unknown[]) => tokenCreate(...args),
    },
  },
}));

const enviarEmail = vi.fn();
vi.mock("@/lib/resend", () => ({
  getResend: () => ({ emails: { send: (...args: unknown[]) => enviarEmail(...args) } }),
}));

vi.mock("@/lib/tenant-provisioning", () => ({
  buildTenantBaseUrl: (slug: string) => `https://${slug}.munoapp.com.br`,
}));

const { enviarBoasVindas } = await import("@/lib/assinatura/email-boas-vindas");

beforeEach(() => {
  vi.clearAllMocks();
  tokenCreate.mockResolvedValue({ token: "token-gerado" });
  enviarEmail.mockResolvedValue({ data: { id: "email-1" } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("e-mail de boas-vindas", () => {
  // 7 dias, e não a 1 hora do "esqueci a senha": aquela é curta porque a
  // pessoa acabou de pedir. Esta precisa sobreviver a quem paga meia-noite e
  // lê o e-mail de manhã.
  it("cria token de sete dias", async () => {
    const agora = new Date("2026-08-26T12:00:00Z");
    vi.setSystemTime(agora);

    await enviarBoasVindas({
      tenantId: "t1", slug: "pizzaria", email: "a@b.c", nome: "Pizzaria",
    });

    const { expiresAt } = tokenCreate.mock.calls[0][0].data;
    expect(expiresAt).toEqual(new Date("2026-09-02T12:00:00Z"));
  });

  it("manda o link no domínio do restaurante, não no da plataforma", async () => {
    await enviarBoasVindas({
      tenantId: "t1", slug: "pizzaria", email: "a@b.c", nome: "Pizzaria",
    });

    const { html } = enviarEmail.mock.calls[0][0];
    expect(html).toContain("pizzaria.munoapp.com.br/redefinir-senha?token=");
  });

  it("usa o token gravado no banco, não um valor inventado", async () => {
    tokenCreate.mockResolvedValue({ token: "abc-123-especifico" });

    await enviarBoasVindas({
      tenantId: "t1", slug: "pizzaria", email: "a@b.c", nome: "Pizzaria",
    });

    const { html } = enviarEmail.mock.calls[0][0];
    expect(html).toContain("token=abc-123-especifico");
  });

  it("grava o token com o tenantId e o email recebidos", async () => {
    await enviarBoasVindas({
      tenantId: "tenant-xyz", slug: "pizzaria", email: "dono@pizzaria.com", nome: "Pizzaria",
    });

    expect(tokenCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-xyz",
        email: "dono@pizzaria.com",
      }),
    });
  });

  // Se a senha aparecesse aqui, ela viveria para sempre na caixa de entrada.
  it("não contém senha nenhuma", async () => {
    await enviarBoasVindas({
      tenantId: "t1", slug: "pizzaria", email: "a@b.c", nome: "Pizzaria",
    });

    const { html } = enviarEmail.mock.calls[0][0];
    expect(html.toLowerCase()).not.toContain("sua senha é");
  });

  it("manda para o email do destinatário recebido", async () => {
    await enviarBoasVindas({
      tenantId: "t1", slug: "pizzaria", email: "dono@pizzaria.com", nome: "Pizzaria",
    });

    expect(enviarEmail.mock.calls[0][0].to).toBe("dono@pizzaria.com");
  });
});
