/**
 * Nota de acompanhamento num lead do CRM.
 *
 * Além de gravar, a rota toca o `updatedAt` do lead — o funil ordena por
 * atividade, e uma nota é atividade. Sem isso o lead recém-trabalhado afundaria
 * na lista.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const LEAD_ID = "lead-1";

const authPlatform = vi.fn();
vi.mock("@/lib/auth-platform", () => ({ authPlatform: () => authPlatform() }));

const leadFindUnique = vi.fn();
const leadUpdate = vi.fn();
const notaCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {},
  prismaUnscoped: {
    lead: {
      findUnique: (...a: unknown[]) => leadFindUnique(...a),
      update: (...a: unknown[]) => leadUpdate(...a),
    },
    leadNote: { create: (...a: unknown[]) => notaCreate(...a) },
  },
}));

import { POST } from "./route";

const params = { params: Promise.resolve({ id: LEAD_ID }) };

function req(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/platform/leads/${LEAD_ID}/notas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authPlatform.mockResolvedValue({ user: { id: "adm-plataforma" } });
  leadFindUnique.mockResolvedValue({ id: LEAD_ID });
  notaCreate.mockResolvedValue({ id: "nota-1", texto: "ligou" });
  leadUpdate.mockResolvedValue({});
});

describe("POST /api/platform/leads/[id]/notas", () => {
  it("recusa sem sessão de plataforma", async () => {
    authPlatform.mockResolvedValue(null);
    const res = await POST(req({ texto: "ligou" }), params);

    expect(res.status).toBe(401);
    expect(notaCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["texto vazio", { texto: "" }],
    ["sem texto", {}],
    ["texto que não é string", { texto: 123 }],
  ])("recusa %s", async (_nome, corpo) => {
    const res = await POST(req(corpo), params);

    expect(res.status).toBe(400);
    expect(notaCreate).not.toHaveBeenCalled();
  });

  it("404 para lead inexistente, sem criar nota órfã", async () => {
    leadFindUnique.mockResolvedValue(null);
    const res = await POST(req({ texto: "ligou" }), params);

    expect(res.status).toBe(404);
    expect(notaCreate).not.toHaveBeenCalled();
  });

  it("grava a nota no lead", async () => {
    const res = await POST(req({ texto: "ligou, retorna terça" }), params);

    expect(res.status).toBe(201);
    expect(notaCreate).toHaveBeenCalledWith({
      data: { leadId: LEAD_ID, texto: "ligou, retorna terça" },
    });
  });

  it("sobe o lead no funil tocando o updatedAt", async () => {
    await POST(req({ texto: "ligou" }), params);

    expect(leadUpdate).toHaveBeenCalledWith({
      where: { id: LEAD_ID },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it("cria a nota antes de tocar o lead", async () => {
    await POST(req({ texto: "ligou" }), params);
    expect(notaCreate.mock.invocationCallOrder[0]).toBeLessThan(
      leadUpdate.mock.invocationCallOrder[0]
    );
  });
});
