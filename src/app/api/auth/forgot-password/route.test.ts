import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Bug real: existiam DUAS implementações de buildTenantBaseUrl e esta rota
// importava a errada (@/lib/tenant-url), que usa a PRIMEIRA entrada de
// ROOT_DOMAIN — gerando um subdomínio de dois níveis, fora do certificado
// curinga *.munoapp.com.br. Todo link de "esqueci minha senha" saía morto.
// Este teste prende a rota ao host de verdade que o restaurante atende.

const userFindUnique = vi.fn();
const tokenDeleteMany = vi.fn();
const tokenCreate = vi.fn();
const tenantFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    passwordResetToken: {
      deleteMany: (...args: unknown[]) => tokenDeleteMany(...args),
      create: (...args: unknown[]) => tokenCreate(...args),
    },
    tenant: { findUnique: (...args: unknown[]) => tenantFindUnique(...args) },
  },
}));

const enviarEmail = vi.fn();
vi.mock("@/lib/resend", () => ({
  resend: { emails: { send: (...args: unknown[]) => enviarEmail(...args) } },
}));

vi.mock("@/lib/restaurant", () => ({
  getRestaurantInfo: vi.fn().mockResolvedValue({
    name: "Pizzaria Teste",
    address: "Rua Teste, 123",
    phone: "11999999999",
    logoUrl: "/munowbg.png",
    floorPlanImageUrl: null,
  }),
}));

const { POST } = await import("@/app/api/auth/forgot-password/route");

function requisicao(): NextRequest {
  return new NextRequest("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: { "x-tenant-id": "tenant-1", "content-type": "application/json" },
    body: JSON.stringify({ email: "dono@pizzaria.com" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = "chave-de-teste";
  // Formato real de produção: institucional primeiro, domínio nu por último.
  process.env.ROOT_DOMAIN = "www.munoapp.com.br,munoapp.com.br";
  userFindUnique.mockResolvedValue({
    name: "Dono da Pizzaria",
    password: "hash-qualquer",
  });
  tokenDeleteMany.mockResolvedValue({ count: 0 });
  tokenCreate.mockResolvedValue({ token: "token-gerado" });
  tenantFindUnique.mockResolvedValue({ slug: "pizzaria" });
  enviarEmail.mockResolvedValue({ data: { id: "email-1" } });
});

describe("POST /api/auth/forgot-password — host do link de redefinição", () => {
  it("manda o link no domínio nu do tenant, de um nível só", async () => {
    const res = await POST(requisicao());

    expect(res.status).toBe(200);
    expect(enviarEmail).toHaveBeenCalledTimes(1);
    const { html } = enviarEmail.mock.calls[0][0];
    expect(html).toContain("https://pizzaria.munoapp.com.br/redefinir-senha?token=token-gerado");
  });

  it("nunca gera o host de dois níveis do bug (pizzaria.www.munoapp.com.br)", async () => {
    const res = await POST(requisicao());

    expect(res.status).toBe(200);
    const { html } = enviarEmail.mock.calls[0][0];
    expect(html).not.toContain("pizzaria.www.munoapp.com.br");
  });

  it("quando o tenant some da consulta, cai para o slug default (subdomínio comum hoje)", async () => {
    // default não é mais servido no domínio raiz (ver AGENTS.md, seção "Os
    // domínios") — é um tenant normal em default.munoapp.com.br. Por isso o
    // fallback pode tratá-lo como qualquer outro slug.
    tenantFindUnique.mockResolvedValue(null);

    const res = await POST(requisicao());

    expect(res.status).toBe(200);
    const { html } = enviarEmail.mock.calls[0][0];
    expect(html).toContain("https://default.munoapp.com.br/redefinir-senha?token=token-gerado");
  });

  // O SDK do Resend não lança quando a API recusa: devolve { data: null,
  // error }. Sem conferir esse retorno, um envio que não saiu passa por
  // sucesso e ninguém fica sabendo — o usuário espera um e-mail que nunca
  // chega, e não há linha de log para explicar.
  //
  // Mas o desfecho NÃO pode ser lançar: esta rota devolve { ok: true } mesmo
  // para e-mail inexistente, de propósito, para não revelar quais contas
  // existem. Um 500 só quando o endereço existe entregaria exatamente essa
  // informação. Por isso: loga e mantém a resposta.
  it("envio recusado pelo Resend vira log, e a resposta continua ok para não revelar se a conta existe", async () => {
    enviarEmail.mockResolvedValue({
      data: null,
      error: { statusCode: 403, name: "validation_error", message: "domain is not verified" },
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(requisicao());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("dono@pizzaria.com"),
      expect.objectContaining({ message: "domain is not verified" })
    );

    consoleErrorSpy.mockRestore();
  });
});
