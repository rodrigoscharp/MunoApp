/**
 * Resolve o QR da mesa em mesa. Rota pública, sem sessão — o token no QR é a
 * credencial. Por isso o `select` é fechado e a mesa precisa estar ativa: QR de
 * mesa desativada (removida do salão, impressa em papel que ficou por aí) não
 * pode continuar abrindo pedido.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "restaurante-a";
const TOKEN = "token-da-mesa";

const tableFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { table: { findFirst: (...a: unknown[]) => tableFindFirst(...a) } },
}));

import { GET } from "./route";

const params = { params: Promise.resolve({ token: TOKEN }) };

function req({
  tenant = true,
  plano = "MEMBRO_MESA_QR",
}: { tenant?: boolean; plano?: string | null } = {}) {
  return new NextRequest(`http://localhost/api/tables/token/${TOKEN}`, {
    headers: {
      ...(tenant ? { "x-tenant-id": TENANT } : {}),
      ...(plano ? { "x-tenant-plano": plano } : {}),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  tableFindFirst.mockResolvedValue({
    id: "mesa-1",
    number: 7,
    name: "Varanda",
    token: TOKEN,
  });
});

describe("GET /api/tables/token/[token]", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await GET(req({ tenant: false }), params);
    expect(res.status).toBe(400);
    expect(tableFindFirst).not.toHaveBeenCalled();
  });

  it("recusa restaurante sem o plano de mesa QR", async () => {
    const res = await GET(req({ plano: "MEMBRO" }), params);
    expect(res.status).toBe(403);
    expect(tableFindFirst).not.toHaveBeenCalled();
  });

  it("recusa quando o header de plano não veio, em vez de liberar", async () => {
    const res = await GET(req({ plano: null }), params);
    expect(res.status).toBe(403);
  });

  it("não exige login: o QR é a credencial", async () => {
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
  });

  it("exige mesa ativa e pede só os campos públicos", async () => {
    await GET(req(), params);
    expect(tableFindFirst).toHaveBeenCalledWith({
      where: { token: TOKEN, active: true },
      select: { id: true, number: true, name: true, token: true },
    });
  });

  it("404 para QR de mesa desativada", async () => {
    tableFindFirst.mockResolvedValue(null);
    const res = await GET(req(), params);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Mesa não encontrada" });
  });

  it("404 para token de mesa de outro restaurante", async () => {
    // A extensão de tenant escopa o findFirst: a mesa de outro restaurante não
    // é encontrada, e a resposta é indistinguível de token inexistente.
    tableFindFirst.mockResolvedValue(null);
    const res = await GET(req(), params);
    expect(res.status).toBe(404);
  });

  it("devolve 500 genérico quando o banco falha", async () => {
    tableFindFirst.mockRejectedValue(new Error("timeout"));
    const res = await GET(req(), params);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Erro interno do servidor" });
  });
});
