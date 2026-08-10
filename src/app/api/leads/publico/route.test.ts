import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const ORIGEM_OK = "https://join.munoapp.com.br";

// --- mocks -----------------------------------------------------------------

const findMany = vi.fn();
const create = vi.fn();
const update = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    lead: {
      findMany: (...args: unknown[]) => findMany(...args),
      create: (...args: unknown[]) => create(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

const { POST, OPTIONS } = await import("@/app/api/leads/publico/route");

// --- helpers ---------------------------------------------------------------

// IP diferente a cada chamada por padrão. O limitador é módulo-escopo e
// sobrevive entre os casos deste arquivo: com IP fixo, o sétimo teste levaria
// 429 por causa dos seis anteriores, e falharia por um motivo que nada tem a
// ver com o que ele afirma. Quem testa o 429 passa um IP fixo de propósito.
let contadorDeIp = 0;

function requisicao(
  body: unknown,
  { origem = ORIGEM_OK, ip = `203.0.113.${++contadorDeIp}` } = {}
): NextRequest {
  return new NextRequest("http://localhost/api/leads/publico", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: origem,
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

const VALIDO = {
  restaurante: "Burguer da Esquina",
  telefone: "(11) 99999-9999",
  plano: "Membro MUNO",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LANDING_ORIGIN = ORIGEM_OK;
  findMany.mockResolvedValue([]);
  create.mockResolvedValue({ id: "lead-novo" });
  update.mockResolvedValue({ id: "lead-existente" });
});

// --- testes ----------------------------------------------------------------

describe("POST /api/leads/publico", () => {
  it("grava o lead com origem landing", async () => {
    const res = await POST(requisicao(VALIDO));

    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      restaurante: "Burguer da Esquina",
      telefone: "(11) 99999-9999",
      plano: "Membro MUNO",
      origem: "landing",
    });
  });

  it("honeypot preenchido responde 201 e NÃO grava", async () => {
    // O 201 é deliberado: um 400 ensinaria ao bot qual campo é a armadilha.
    const res = await POST(requisicao({ ...VALIDO, website: "http://spam.example" }));

    expect(res.status).toBe(201);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("honeypot vazio não atrapalha o envio legítimo", async () => {
    const res = await POST(requisicao({ ...VALIDO, website: "" }));

    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("recusa payload inválido com 400", async () => {
    const res = await POST(requisicao({ restaurante: "x", telefone: "((((" }));

    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("recusa origem não permitida com 403", async () => {
    const res = await POST(requisicao(VALIDO, { origem: "https://site-aleatorio.example" }));

    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("devolve o cabeçalho de CORS da origem permitida", async () => {
    const res = await POST(requisicao(VALIDO));

    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGEM_OK);
    expect(res.headers.get("vary")).toContain("Origin");
  });

  it("atualiza em vez de criar quando a lib decide atualizar", async () => {
    findMany.mockResolvedValue([
      {
        id: "lead-42",
        telefone: "11999999999",
        origem: "landing",
        createdAt: new Date(),
      },
    ]);

    const res = await POST(requisicao(VALIDO));

    expect(res.status).toBe(201);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].where).toEqual({ id: "lead-42" });
    expect(create).not.toHaveBeenCalled();
  });

  it("não mexe no status ao atualizar", async () => {
    // Se você já moveu o lead para CONTATADO, um reenvio não pode te devolver
    // para NOVO — isso desfaria trabalho seu.
    findMany.mockResolvedValue([
      {
        id: "lead-42",
        telefone: "11999999999",
        origem: "landing",
        createdAt: new Date(),
      },
    ]);

    await POST(requisicao(VALIDO));

    expect(update.mock.calls[0][0].data).not.toHaveProperty("status");
  });

  it("barra com 429 ao estourar o teto do mesmo IP", async () => {
    // IP fixo e fora da faixa que o helper gera, para não colidir com os
    // outros casos deste arquivo.
    const ip = "198.51.100.7";
    for (let i = 0; i < 5; i++) {
      const ok = await POST(requisicao(VALIDO, { ip }));
      expect(ok.status).toBe(201);
    }

    const barrado = await POST(requisicao(VALIDO, { ip }));
    expect(barrado.status).toBe(429);
    expect(create).toHaveBeenCalledTimes(5);
  });
});

describe("OPTIONS /api/leads/publico", () => {
  it("responde ao preflight da origem permitida", async () => {
    const res = await OPTIONS(
      new NextRequest("http://localhost/api/leads/publico", {
        method: "OPTIONS",
        headers: { origin: ORIGEM_OK },
      })
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGEM_OK);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("recusa preflight de origem estranha", async () => {
    const res = await OPTIONS(
      new NextRequest("http://localhost/api/leads/publico", {
        method: "OPTIONS",
        headers: { origin: "https://site-aleatorio.example" },
      })
    );

    expect(res.status).toBe(403);
  });
});
