/**
 * A troca de senha pelo link do e-mail.
 *
 * `token` é `@unique` global no schema — não é único por tenant. Quem impede um
 * token emitido no restaurante B de valer no subdomínio de A é a extensão do
 * Prisma, que injeta tenantId no `where`. Como isso não aparece no código da
 * rota, é aqui que fica registrado.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

const TENANT = "restaurante-a";
const TOKEN = "token-do-email";

const tokenFindUnique = vi.fn();
const tokenDelete = vi.fn();
const userUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    passwordResetToken: {
      findUnique: (...a: unknown[]) => tokenFindUnique(...a),
      delete: (...a: unknown[]) => tokenDelete(...a),
    },
    user: { update: (...a: unknown[]) => userUpdate(...a) },
  },
}));

import { POST } from "./route";

function req(body: Record<string, unknown>, comTenant = true) {
  return new NextRequest("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: {
      ...(comTenant ? { "x-tenant-id": TENANT } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const daquiA1h = () => new Date(Date.now() + 60 * 60 * 1000);
const ontem = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

const corpoValido = { token: TOKEN, password: "senha-nova-123" };

beforeEach(() => {
  vi.clearAllMocks();
  tokenFindUnique.mockResolvedValue({
    token: TOKEN,
    email: "cliente@exemplo.com",
    tenantId: TENANT,
    expiresAt: daquiA1h(),
  });
  tokenDelete.mockResolvedValue({});
  userUpdate.mockResolvedValue({});
});

describe("porta de entrada", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await POST(req(corpoValido, false));
    expect(res.status).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("recusa senha curta com a mensagem do schema", async () => {
    const res = await POST(req({ token: TOKEN, password: "123" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Senha deve ter pelo menos 6 caracteres" });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("recusa corpo sem token", async () => {
    const res = await POST(req({ password: "senha-nova-123" }));
    expect(res.status).toBe(400);
    expect(tokenFindUnique).not.toHaveBeenCalled();
  });
});

describe("o token é procurado dentro do restaurante da request", () => {
  it("consulta pelo token recebido", async () => {
    await POST(req(corpoValido));
    expect(tokenFindUnique).toHaveBeenCalledWith({ where: { token: TOKEN } });
  });

  it("recusa token que não existe neste restaurante", async () => {
    // A extensão do Prisma acrescenta tenantId ao where: um token emitido em
    // outro restaurante simplesmente não é encontrado aqui.
    tokenFindUnique.mockResolvedValue(null);
    const res = await POST(req(corpoValido));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Link inválido ou expirado" });
    expect(userUpdate).not.toHaveBeenCalled();
  });
});

describe("token expirado", () => {
  beforeEach(() => {
    tokenFindUnique.mockResolvedValue({
      token: TOKEN,
      email: "cliente@exemplo.com",
      tenantId: TENANT,
      expiresAt: ontem(),
    });
  });

  it("não troca a senha", async () => {
    const res = await POST(req(corpoValido));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Link expirado. Solicite um novo." });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("queima o token expirado, para o link não ficar rondando", async () => {
    await POST(req(corpoValido));
    expect(tokenDelete).toHaveBeenCalledWith({ where: { token: TOKEN } });
  });
});

describe("troca bem-sucedida", () => {
  it("grava a senha do usuário do par tenant + e-mail do token", async () => {
    await POST(req(corpoValido));

    expect(userUpdate).toHaveBeenCalledWith({
      where: { tenantId_email: { tenantId: TENANT, email: "cliente@exemplo.com" } },
      data: { password: expect.any(String) },
    });
  });

  it("grava um hash, nunca a senha em texto", async () => {
    await POST(req(corpoValido));

    const gravada = userUpdate.mock.calls[0][0].data.password;
    expect(gravada).not.toBe("senha-nova-123");
    await expect(bcrypt.compare("senha-nova-123", gravada)).resolves.toBe(true);
  });

  it("usa o e-mail do token, não um que venha no corpo", async () => {
    await POST(req({ ...corpoValido, email: "intruso@exemplo.com" }));
    expect(userUpdate.mock.calls[0][0].where.tenantId_email.email).toBe("cliente@exemplo.com");
  });

  it("queima o token depois de usar, para o link valer uma vez só", async () => {
    await POST(req(corpoValido));

    expect(tokenDelete).toHaveBeenCalledWith({ where: { token: TOKEN } });
    expect(userUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      tokenDelete.mock.invocationCallOrder[0]
    );
  });

  it("responde ok", async () => {
    const res = await POST(req(corpoValido));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("devolve 500 genérico se a gravação falhar, sem queimar o token", async () => {
    userUpdate.mockRejectedValue(new Error("connection terminated"));
    const res = await POST(req(corpoValido));

    expect(res.status).toBe(500);
    expect(tokenDelete).not.toHaveBeenCalled();
  });
});
