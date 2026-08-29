/**
 * Cadastro de cliente no restaurante do subdomínio.
 *
 * Duas coisas se afirmam aqui: a senha nunca sai da rota (nem em texto, nem em
 * hash), e a conta nasce presa ao tenant da request — o par (tenantId, email) é
 * único, então o mesmo e-mail pode ter conta em dois restaurantes, e um não
 * pode bloquear o cadastro no outro.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

const TENANT = "restaurante-a";

const userFindUnique = vi.fn();
const userCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      create: (...a: unknown[]) => userCreate(...a),
    },
  },
}));

import { POST } from "./route";

function req(body: Record<string, unknown>, comTenant = true) {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: {
      ...(comTenant ? { "x-tenant-id": TENANT } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const corpoValido = {
  name: "Cliente Novo",
  email: "novo@exemplo.com",
  password: "senha-forte-123",
};

beforeEach(() => {
  vi.clearAllMocks();
  userFindUnique.mockResolvedValue(null);
  userCreate.mockResolvedValue({
    id: "user-novo",
    name: "Cliente Novo",
    email: "novo@exemplo.com",
    role: "CUSTOMER",
  });
});

describe("porta de entrada", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await POST(req(corpoValido, false));
    expect(res.status).toBe(400);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["nome curto", { ...corpoValido, name: "A" }, "Nome deve ter pelo menos 2 caracteres"],
    ["e-mail inválido", { ...corpoValido, email: "sem-arroba" }, "Email inválido"],
    ["senha curta", { ...corpoValido, password: "123" }, "Senha deve ter pelo menos 6 caracteres"],
  ])("recusa %s com a mensagem do schema", async (_nome, corpo, mensagem) => {
    const res = await POST(req(corpo));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: mensagem });
    expect(userCreate).not.toHaveBeenCalled();
  });
});

describe("e-mail já cadastrado", () => {
  it("recusa com 409 sem tentar criar", async () => {
    userFindUnique.mockResolvedValue({ id: "user-existente" });
    const res = await POST(req(corpoValido));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Email já cadastrado" });
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("procura o e-mail apenas dentro do restaurante da request", async () => {
    // O mesmo e-mail pode ter conta em dois restaurantes; a busca é pelo par.
    await POST(req(corpoValido));
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { tenantId_email: { tenantId: TENANT, email: "novo@exemplo.com" } },
    });
  });
});

describe("conta criada", () => {
  it("nasce presa ao tenant da request", async () => {
    await POST(req(corpoValido));
    expect(userCreate.mock.calls[0][0].data.tenantId).toBe(TENANT);
  });

  it("ignora tenantId enviado no corpo", async () => {
    await POST(req({ ...corpoValido, tenantId: "restaurante-b" }));
    expect(userCreate.mock.calls[0][0].data.tenantId).toBe(TENANT);
  });

  it("não deixa o corpo escolher o papel da conta", async () => {
    // Sem isto, `role: "ADMIN"` no corpo entregaria o painel do restaurante.
    await POST(req({ ...corpoValido, role: "ADMIN" }));
    expect(userCreate.mock.calls[0][0].data).not.toHaveProperty("role");
  });

  it("guarda a senha como hash bcrypt", async () => {
    await POST(req(corpoValido));

    const gravada = userCreate.mock.calls[0][0].data.password;
    expect(gravada).not.toBe("senha-forte-123");
    await expect(bcrypt.compare("senha-forte-123", gravada)).resolves.toBe(true);
  });

  it("não devolve a senha na resposta", async () => {
    const res = await POST(req(corpoValido));
    const corpo = await res.json();

    expect(res.status).toBe(201);
    expect(corpo).not.toHaveProperty("password");
    expect(JSON.stringify(corpo)).not.toContain("senha-forte-123");
  });

  it("pede ao banco só os campos públicos", async () => {
    await POST(req(corpoValido));
    expect(userCreate.mock.calls[0][0].select).toEqual({
      id: true,
      name: true,
      email: true,
      role: true,
    });
  });

  it("devolve 500 genérico quando o banco falha", async () => {
    userCreate.mockRejectedValue(new Error("unique constraint violation"));
    const res = await POST(req(corpoValido));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Erro interno do servidor" });
  });
});
