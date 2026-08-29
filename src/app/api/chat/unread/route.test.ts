/**
 * O sino de notificações do cliente, chamado de minuto em minuto pelo polling.
 *
 * O `since` vem da query string e ia direto para `new Date()`. Texto que não é
 * data vira Invalid Date, que o Prisma rejeita com erro de driver — 500 numa
 * rota chamada o tempo todo. Data ilegível é tratada como ausente.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "restaurante-a";
const CLIENTE = "cliente-1";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const chatFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { chatMessage: { findMany: (...a: unknown[]) => chatFindMany(...a) } },
}));

import { GET } from "./route";

function req(since?: string, comTenant = true) {
  const url = since
    ? `http://localhost/api/chat/unread?since=${encodeURIComponent(since)}`
    : "http://localhost/api/chat/unread";
  return new NextRequest(url, {
    headers: comTenant ? { "x-tenant-id": TENANT } : {},
  });
}

const where = () => chatFindMany.mock.calls[0][0].where;

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: CLIENTE, role: "CUSTOMER" } });
  chatFindMany.mockResolvedValue([]);
});

describe("porta de entrada", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await GET(req(undefined, false));
    expect(res.status).toBe(400);
  });

  it("recusa visitante sem sessão", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(chatFindMany).not.toHaveBeenCalled();
  });
});

describe("o que o sino busca", () => {
  it("só mensagens do restaurante, nos pedidos do próprio cliente", async () => {
    await GET(req());
    expect(where()).toMatchObject({
      senderRole: "ADMIN",
      order: { userId: CLIENTE },
    });
  });

  it("não vaza conversa de pedido de outro cliente", async () => {
    auth.mockResolvedValue({ user: { id: "outro-cliente", role: "CUSTOMER" } });
    await GET(req());
    expect(where().order).toEqual({ userId: "outro-cliente" });
  });

  it("filtra pelo since quando ele é uma data válida", async () => {
    await GET(req("2026-08-29T12:00:00.000Z"));
    expect(where().createdAt).toEqual({ gt: new Date("2026-08-29T12:00:00.000Z") });
  });

  it("devolve tudo quando não há since — a primeira chamada do sino", async () => {
    await GET(req());
    expect(where()).not.toHaveProperty("createdAt");
  });

  it.each(["ontem", "não-é-data", "", "12345678901234567890"])(
    "trata since ilegível (%s) como ausente, em vez de estourar 500",
    async (since) => {
      const res = await GET(req(since));

      expect(res.status).toBe(200);
      expect(where()).not.toHaveProperty("createdAt");
    }
  );

  it("pede só os campos que o sino usa", async () => {
    await GET(req());
    expect(chatFindMany.mock.calls[0][0].select).toEqual({
      id: true,
      orderId: true,
      content: true,
      createdAt: true,
    });
  });

  it("entrega em ordem de chegada", async () => {
    await GET(req());
    expect(chatFindMany.mock.calls[0][0].orderBy).toEqual({ createdAt: "asc" });
  });
});
