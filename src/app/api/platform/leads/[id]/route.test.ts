/**
 * Um lead no CRM da plataforma.
 *
 * Aqui não há tenant: é rota de plataforma, autenticada por `authPlatform` e
 * lendo por `prismaUnscoped`. A regra que mais importa está no schema — o
 * `tenantId` **não** é aceito no corpo, porque vincular lead a restaurante é
 * privilégio da rota de conversão, o único caminho que provisiona de verdade.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const LEAD_ID = "lead-1";

const authPlatform = vi.fn();
vi.mock("@/lib/auth-platform", () => ({ authPlatform: () => authPlatform() }));

const leadFindUnique = vi.fn();
const leadUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {},
  prismaUnscoped: {
    lead: {
      findUnique: (...a: unknown[]) => leadFindUnique(...a),
      update: (...a: unknown[]) => leadUpdate(...a),
    },
  },
}));

import { GET, PATCH } from "./route";

const params = { params: Promise.resolve({ id: LEAD_ID }) };

function req(body?: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/platform/leads/${LEAD_ID}`, {
    method: body ? "PATCH" : "GET",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const dados = () => leadUpdate.mock.calls[0][0].data;

beforeEach(() => {
  vi.clearAllMocks();
  authPlatform.mockResolvedValue({ user: { id: "adm-plataforma" } });
  leadFindUnique.mockResolvedValue({ id: LEAD_ID, restaurante: "Pizzaria" });
  leadUpdate.mockResolvedValue({ id: LEAD_ID });
});

describe("só o console da plataforma entra", () => {
  it("GET recusa sem sessão de plataforma", async () => {
    authPlatform.mockResolvedValue(null);
    const res = await GET(req(), params);

    expect(res.status).toBe(401);
    expect(leadFindUnique).not.toHaveBeenCalled();
  });

  it("PATCH recusa sem sessão de plataforma", async () => {
    authPlatform.mockResolvedValue(null);
    const res = await PATCH(req({ status: "CONTATADO" }), params);

    expect(res.status).toBe(401);
    expect(leadUpdate).not.toHaveBeenCalled();
  });
});

describe("GET", () => {
  it("traz as notas em ordem e o restaurante vinculado", async () => {
    await GET(req(), params);
    expect(leadFindUnique).toHaveBeenCalledWith({
      where: { id: LEAD_ID },
      include: { notas: { orderBy: { createdAt: "asc" } }, tenant: true },
    });
  });

  it("404 para lead inexistente", async () => {
    leadFindUnique.mockResolvedValue(null);
    const res = await GET(req(), params);
    expect(res.status).toBe(404);
  });
});

describe("PATCH — o que pode mudar", () => {
  it("grava o novo status do funil", async () => {
    await PATCH(req({ status: "NEGOCIACAO" }), params);
    expect(dados()).toEqual({ status: "NEGOCIACAO" });
  });

  it("recusa status fora do funil", async () => {
    const res = await PATCH(req({ status: "GANHOU" }), params);

    expect(res.status).toBe(400);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it("404 para lead inexistente, sem gravar", async () => {
    leadFindUnique.mockResolvedValue(null);
    const res = await PATCH(req({ status: "CONTATADO" }), params);

    expect(res.status).toBe(404);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it("não deixa o corpo vincular o lead a um restaurante", async () => {
    // Vincular é privilégio da rota de conversão.
    await PATCH(req({ status: "FECHADO", tenantId: "restaurante-a" }), params);
    expect(dados()).not.toHaveProperty("tenantId");
  });

  it("é PATCH parcial: não apaga campo que o corpo não mencionou", async () => {
    await PATCH(req({ status: "CONTATADO" }), params);

    expect(dados()).not.toHaveProperty("telefone");
    expect(dados()).not.toHaveProperty("cidade");
  });
});

describe("PATCH — campo em branco vira null, nunca string vazia", () => {
  it.each([
    ["telefone", "   "],
    ["cidade", ""],
    ["motivoPerda", "  "],
  ])("%s em branco vira null", async (campo, valor) => {
    await PATCH(req({ [campo]: valor }), params);
    expect(dados()[campo]).toBeNull();
  });

  it("apara espaços dos campos preenchidos", async () => {
    await PATCH(req({ cidade: "  Ubatuba  " }), params);
    expect(dados().cidade).toBe("Ubatuba");
  });

  it("aceita e-mail vazio como limpeza do campo", async () => {
    const res = await PATCH(req({ email: "" }), params);

    expect(res.status).toBe(200);
    expect(dados().email).toBeNull();
  });

  it("recusa e-mail malformado", async () => {
    const res = await PATCH(req({ email: "sem-arroba" }), params);
    expect(res.status).toBe(400);
  });

  it("recusa nome de restaurante com uma letra", async () => {
    const res = await PATCH(req({ restaurante: "X" }), params);
    expect(res.status).toBe(400);
  });
});

describe("PATCH — o funil de checkout não se move à mão", () => {
  // O funil de checkout é derivado dos fatos. Um PATCH que sobrescreve o que o
  // servidor derivou cria divergência entre a tela e o que aconteceu, e é o
  // tipo de divergência que ninguém percebe: os dois números parecem certos,
  // cada um por conta própria.
  it("recusa mudar à mão o status de um lead de checkout", async () => {
    leadFindUnique.mockResolvedValue({ id: LEAD_ID, origem: "checkout" });

    const res = await PATCH(req({ status: "FECHADO" }), params);

    expect(res.status).toBe(409);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it.each(["landing", "manual"])(
    "deixa mudar o status do lead de origem %s",
    async (origem) => {
      leadFindUnique.mockResolvedValue({ id: LEAD_ID, origem });

      const res = await PATCH(req({ status: "CONTATADO" }), params);

      expect(res.status).toBe(200);
      expect(leadUpdate).toHaveBeenCalled();
    }
  );

  // O lead de checkout é justamente o que tem e-mail e não tem telefone: se
  // a guarda barrasse o corpo inteiro, o operador que conseguisse o número
  // no WhatsApp não conseguiria salvar, por causa de um campo que o PATCH
  // nem tentou mudar.
  it("PATCH só com telefone num lead de checkout passa, mesmo sem poder mover o status", async () => {
    leadFindUnique.mockResolvedValue({ id: LEAD_ID, origem: "checkout" });

    const res = await PATCH(req({ telefone: "11999998888" }), params);

    expect(res.status).toBe(200);
    expect(leadUpdate).toHaveBeenCalled();
    expect(dados()).not.toHaveProperty("status");
    expect(dados().telefone).toBe("11999998888");
  });
});
