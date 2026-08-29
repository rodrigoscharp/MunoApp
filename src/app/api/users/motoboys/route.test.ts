/**
 * Cadastro de motoboy pelo admin do restaurante.
 *
 * É a única rota que cria conta com papel diferente de CUSTOMER. O papel é
 * fixado no servidor (`role: "MOTOBOY"`), e a listagem não pode devolver o hash
 * da senha — a resposta vai para uma tela do /adm.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

const TENANT = "restaurante-a";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const userFindMany = vi.fn();
const userFindUnique = vi.fn();
const userCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: (...a: unknown[]) => userFindMany(...a),
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      create: (...a: unknown[]) => userCreate(...a),
    },
  },
}));

import { GET, POST } from "./route";

function req(method: string, body?: Record<string, unknown>, comTenant = true) {
  return new NextRequest("http://localhost/api/users/motoboys", {
    method,
    headers: {
      ...(comTenant ? { "x-tenant-id": TENANT } : {}),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const motoboyValido = {
  name: "João Entregador",
  email: "joao@exemplo.com",
  password: "senha-forte-123",
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  userFindMany.mockResolvedValue([{ id: "moto-1", name: "João", email: "joao@x.com" }]);
  userFindUnique.mockResolvedValue(null);
  userCreate.mockResolvedValue({
    id: "moto-novo",
    name: "João Entregador",
    email: "joao@exemplo.com",
    createdAt: new Date(),
  });
});

describe("autorização", () => {
  it("GET recusa sem tenant resolvido", async () => {
    const res = await GET(req("GET", undefined, false));
    expect(res.status).toBe(400);
  });

  it("POST recusa sem tenant resolvido", async () => {
    const res = await POST(req("POST", motoboyValido, false));
    expect(res.status).toBe(400);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it.each(["CUSTOMER", "KITCHEN", "MOTOBOY"])("GET recusa role %s", async (role) => {
    auth.mockResolvedValue({ user: { id: "u", role } });
    const res = await GET(req("GET"));
    expect(res.status).toBe(403);
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it("POST recusa o próprio motoboy criando outro motoboy", async () => {
    auth.mockResolvedValue({ user: { id: "moto-1", role: "MOTOBOY" } });
    const res = await POST(req("POST", motoboyValido));

    expect(res.status).toBe(403);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("recusa visitante sem sessão", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req("GET"));
    expect(res.status).toBe(403);
  });
});

describe("GET — a lista", () => {
  it("filtra apenas motoboys", async () => {
    await GET(req("GET"));
    expect(userFindMany.mock.calls[0][0].where).toEqual({ role: "MOTOBOY" });
  });

  it("não pede a senha ao banco", async () => {
    await GET(req("GET"));
    expect(userFindMany.mock.calls[0][0].select).toEqual({
      id: true,
      name: true,
      email: true,
      createdAt: true,
    });
    expect(userFindMany.mock.calls[0][0].select).not.toHaveProperty("password");
  });

  it("lista do mais recente para o mais antigo", async () => {
    await GET(req("GET"));
    expect(userFindMany.mock.calls[0][0].orderBy).toEqual({ createdAt: "desc" });
  });
});

describe("POST — corpo", () => {
  it.each([
    ["nome curto", { ...motoboyValido, name: "J" }],
    ["e-mail inválido", { ...motoboyValido, email: "sem-arroba" }],
    ["senha curta", { ...motoboyValido, password: "123" }],
  ])("recusa %s", async (_nome, corpo) => {
    const res = await POST(req("POST", corpo));
    expect(res.status).toBe(400);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("recusa e-mail já cadastrado no restaurante", async () => {
    userFindUnique.mockResolvedValue({ id: "user-existente" });
    const res = await POST(req("POST", motoboyValido));

    expect(res.status).toBe(409);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("procura o e-mail apenas dentro do restaurante da request", async () => {
    await POST(req("POST", motoboyValido));
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { tenantId_email: { tenantId: TENANT, email: "joao@exemplo.com" } },
    });
  });
});

describe("POST — a conta criada", () => {
  it("nasce com papel MOTOBOY, fixado no servidor", async () => {
    await POST(req("POST", motoboyValido));
    expect(userCreate.mock.calls[0][0].data.role).toBe("MOTOBOY");
  });

  it("ignora role enviado no corpo", async () => {
    // Um admin não pode fabricar outro admin por esta rota.
    await POST(req("POST", { ...motoboyValido, role: "ADMIN" }));
    expect(userCreate.mock.calls[0][0].data.role).toBe("MOTOBOY");
  });

  it("nasce presa ao tenant da request", async () => {
    await POST(req("POST", { ...motoboyValido, tenantId: "restaurante-b" }));
    expect(userCreate.mock.calls[0][0].data.tenantId).toBe(TENANT);
  });

  it("guarda a senha como hash bcrypt", async () => {
    await POST(req("POST", motoboyValido));

    const gravada = userCreate.mock.calls[0][0].data.password;
    expect(gravada).not.toBe("senha-forte-123");
    await expect(bcrypt.compare("senha-forte-123", gravada)).resolves.toBe(true);
  });

  it("não devolve a senha na resposta", async () => {
    const res = await POST(req("POST", motoboyValido));
    const corpo = await res.json();

    expect(res.status).toBe(201);
    expect(corpo).not.toHaveProperty("password");
  });

  it("devolve 500 genérico quando o banco falha", async () => {
    userCreate.mockRejectedValue(new Error("connection terminated"));
    const res = await POST(req("POST", motoboyValido));
    expect(res.status).toBe(500);
  });
});
