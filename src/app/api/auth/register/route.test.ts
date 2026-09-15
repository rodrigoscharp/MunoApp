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

// Cada requisição sai de um IP diferente por padrão: o limitador vive no módulo
// e dura o arquivo inteiro, e os testes que não são sobre o limite não podem
// esbarrar nele.
let ipSequencial = 0;

function req(body: Record<string, unknown>, comTenant = true, ip = `ip-${++ipSequencial}`) {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: {
      ...(comTenant ? { "x-tenant-id": TENANT } : {}),
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
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

describe("limite de tentativas", () => {
  // Dois limitadores, não um. Contar cadastro bem-sucedido no mesmo balde do
  // 409 refusava o sexto cliente real atrás do mesmo IP de operadora — CGNAT
  // põe muita gente atrás de poucos IPs públicos, e uma promoção de
  // restaurante esbarraria nisso no primeiro dia. Quem é limitado a 5 é só a
  // enumeração (o 409 é o que ela lê); cadastro de verdade tem uma janela
  // maior, geral, contra bot.
  it("seis cadastros bem-sucedidos do mesmo IP passam todos", async () => {
    for (let i = 0; i < 6; i++) {
      const res = await POST(req({ ...corpoValido, email: `c${i}@exemplo.com` }, true, "203.0.113.7"));
      expect(res.status).toBe(201);
    }
  });

  it("com e-mail já cadastrado, a sexta tentativa do mesmo IP recusa com 429 em vez de 409", async () => {
    userFindUnique.mockResolvedValue({ id: "user-existente" });

    for (let i = 0; i < 5; i++) {
      const res = await POST(req(corpoValido, true, "203.0.113.10"));
      expect(res.status).toBe(409);
    }

    const res = await POST(req(corpoValido, true, "203.0.113.10"));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Muitas tentativas. Tente de novo em alguns minutos." });
  });

  it(
    "recusa com 429 a vigésima primeira tentativa do mesmo IP",
    async () => {
      // 20 cadastros de verdade passam por bcrypt.hash de 12 rounds cada; sob a
      // suíte inteira rodando em paralelo isso estoura o timeout padrão de 5s.
      for (let i = 0; i < 20; i++) {
        const res = await POST(req({ ...corpoValido, email: `g${i}@exemplo.com` }, true, "203.0.113.20"));
        expect(res.status).toBe(201);
      }

      const res = await POST(req(corpoValido, true, "203.0.113.20"));

      expect(res.status).toBe(429);
    },
    15000
  );

  it("outro IP continua passando", async () => {
    userFindUnique.mockResolvedValue({ id: "user-existente" });
    for (let i = 0; i < 5; i++) await POST(req(corpoValido, true, "203.0.113.8"));

    const res = await POST(req(corpoValido, true, "203.0.113.9"));

    expect(res.status).toBe(409);
  });

  it("conta só o primeiro IP do x-forwarded-for", async () => {
    // A Vercel põe o IP do cliente primeiro. Os seguintes são proxies, e contar
    // a lista inteira deixaria o cliente fugir do limite trocando o próprio
    // header.
    userFindUnique.mockResolvedValue({ id: "user-existente" });
    for (let i = 0; i < 5; i++) await POST(req(corpoValido, true, "198.51.100.1, 10.0.0.1"));

    const res = await POST(req(corpoValido, true, "198.51.100.1, 10.0.0.2"));

    expect(res.status).toBe(429);
  });
});
