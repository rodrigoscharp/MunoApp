/**
 * O chat entre cliente e restaurante, dentro de um pedido.
 *
 * A regra de acesso é a mesma nas duas pontas: dono do pedido ou ADMIN. E o
 * aviso em tempo real vai **sem o conteúdo** — canal Broadcast não é autorizado
 * por padrão, então o texto só sai pelo GET, que confere quem está pedindo.
 *
 * O corpo do POST é a única entrada de texto livre do app que não passava por
 * zod: `(body.content ?? "").trim()` quebra com qualquer coisa que não seja
 * string, e não tinha teto de tamanho.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "restaurante-a";
const ORDER_ID = "pedido-1";
const DONO = "cliente-1";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const orderFindUnique = vi.fn();
const chatFindMany = vi.fn();
const chatCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findUnique: (...a: unknown[]) => orderFindUnique(...a) },
    chatMessage: {
      findMany: (...a: unknown[]) => chatFindMany(...a),
      create: (...a: unknown[]) => chatCreate(...a),
    },
  },
}));

const broadcastTenantEvent = vi.fn();
vi.mock("@/lib/realtime", () => ({
  broadcastTenantEvent: (...a: unknown[]) => broadcastTenantEvent(...a),
  broadcastOrderUpdate: vi.fn(),
}));

import { GET, POST } from "./route";

const params = { params: Promise.resolve({ id: ORDER_ID }) };

function req(method: string, body?: unknown, comTenant = true) {
  return new NextRequest(`http://localhost/api/orders/${ORDER_ID}/chat`, {
    method,
    headers: {
      ...(comTenant ? { "x-tenant-id": TENANT } : {}),
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** A parte da consulta do GET que lê as mensagens, aninhada na do pedido. */
function consultaDasMensagens() {
  return orderFindUnique.mock.calls[0][0].select.chatMessages;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: DONO, name: "Ana", role: "CUSTOMER" } });
  orderFindUnique.mockResolvedValue({
    id: ORDER_ID,
    userId: DONO,
    chatMessages: [{ id: "msg-1", content: "oi" }],
  });
  chatFindMany.mockResolvedValue([{ id: "msg-1", content: "oi" }]);
  chatCreate.mockResolvedValue({ id: "msg-nova", senderRole: "CUSTOMER" });
});

describe("GET — quem pode ler a conversa", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await GET(req("GET", undefined, false), params);
    expect(res.status).toBe(400);
  });

  it("permite o dono do pedido", async () => {
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
  });

  it("permite o ADMIN do restaurante", async () => {
    auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
  });

  it("recusa outro cliente logado", async () => {
    auth.mockResolvedValue({ user: { id: "intruso", role: "CUSTOMER" } });
    const res = await GET(req("GET"), params);

    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain("oi");
  });

  // Pedido e mensagens saem na mesma consulta, então a recusa não pode
  // depender de não ter lido: para quem não é admin, o próprio where das
  // mensagens exige que o pedido seja de quem pede.
  it("para cliente, só pede ao banco mensagens de pedido que é dele", async () => {
    auth.mockResolvedValue({ user: { id: "intruso", role: "CUSTOMER" } });
    await GET(req("GET"), params);
    expect(consultaDasMensagens().where).toMatchObject({
      tenantId: TENANT,
      order: { userId: "intruso" },
    });
  });

  it("para o ADMIN, as mensagens do pedido sem filtro de dono", async () => {
    auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    await GET(req("GET"), params);
    expect(consultaDasMensagens().where).toEqual({ tenantId: TENANT });
  });

  it("recusa visitante sem sessão, sem tocar no banco", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(403);
    expect(orderFindUnique).not.toHaveBeenCalled();
  });

  it("404 para pedido de outro restaurante ou inexistente", async () => {
    orderFindUnique.mockResolvedValue(null);
    const res = await GET(req("GET"), params);

    expect(res.status).toBe(404);
  });

  it("?since devolve só o que chegou depois", async () => {
    await GET(
      new NextRequest(
        `http://localhost/api/orders/${ORDER_ID}/chat?since=2026-10-24T12:00:00.000Z`,
        { headers: { "x-tenant-id": TENANT } }
      ),
      params
    );
    expect(consultaDasMensagens().where.createdAt).toEqual({
      gt: new Date("2026-10-24T12:00:00.000Z"),
    });
  });

  it("?since que não é data é 400, sem tocar no banco", async () => {
    const res = await GET(
      new NextRequest(`http://localhost/api/orders/${ORDER_ID}/chat?since=ontem`, {
        headers: { "x-tenant-id": TENANT },
      }),
      params
    );
    expect(res.status).toBe(400);
    expect(orderFindUnique).not.toHaveBeenCalled();
  });

  // O banco entrega as 200 mais recentes (desc + take: asc cortaria justamente
  // as novas), e a rota devolve em ordem cronológica.
  it("devolve as mensagens em ordem de chegada, mesmo lendo as mais recentes primeiro", async () => {
    orderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      userId: DONO,
      chatMessages: [
        { id: "m3", createdAt: "3" },
        { id: "m2", createdAt: "2" },
        { id: "m1", createdAt: "1" },
      ],
    });

    const res = await GET(req("GET"), params);

    expect(consultaDasMensagens()).toMatchObject({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    expect((await res.json()).map((m: { id: string }) => m.id)).toEqual(["m1", "m2", "m3"]);
  });
});

describe("POST — quem pode escrever", () => {
  it("recusa outro cliente logado", async () => {
    auth.mockResolvedValue({ user: { id: "intruso", role: "CUSTOMER" } });
    const res = await POST(req("POST", { content: "oi" }), params);

    expect(res.status).toBe(403);
    expect(chatCreate).not.toHaveBeenCalled();
  });

  it("404 para pedido inexistente, antes de olhar o corpo", async () => {
    orderFindUnique.mockResolvedValue(null);
    const res = await POST(req("POST", { content: "oi" }), params);
    expect(res.status).toBe(404);
  });
});

describe("POST — o conteúdo da mensagem", () => {
  it("grava a mensagem do dono como CUSTOMER", async () => {
    await POST(req("POST", { content: "cadê meu pedido?" }), params);

    expect(chatCreate).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT,
        orderId: ORDER_ID,
        senderRole: "CUSTOMER",
        senderId: DONO,
        senderName: "Ana",
        content: "cadê meu pedido?",
      },
    });
  });

  it("grava a mensagem do admin como ADMIN", async () => {
    auth.mockResolvedValue({ user: { id: "admin-1", name: "Loja", role: "ADMIN" } });
    await POST(req("POST", { content: "saiu para entrega" }), params);
    expect(chatCreate.mock.calls[0][0].data.senderRole).toBe("ADMIN");
  });

  it("não deixa o corpo escolher quem está falando", async () => {
    await POST(req("POST", { content: "oi", senderRole: "ADMIN", senderId: "outro" }), params);

    expect(chatCreate.mock.calls[0][0].data.senderRole).toBe("CUSTOMER");
    expect(chatCreate.mock.calls[0][0].data.senderId).toBe(DONO);
  });

  it("apara espaços das pontas", async () => {
    await POST(req("POST", { content: "  oi  " }), params);
    expect(chatCreate.mock.calls[0][0].data.content).toBe("oi");
  });

  it.each([
    ["vazia", ""],
    ["só espaços", "   "],
  ])("recusa mensagem %s com 400", async (_nome, content) => {
    const res = await POST(req("POST", { content }), params);

    expect(res.status).toBe(400);
    expect(chatCreate).not.toHaveBeenCalled();
  });

  it("recusa corpo sem o campo content", async () => {
    const res = await POST(req("POST", {}), params);
    expect(res.status).toBe(400);
  });

  it.each([
    ["número", 123],
    ["objeto", { texto: "oi" }],
    ["lista", ["oi"]],
    ["booleano", true],
  ])("recusa content do tipo %s com 400, não 500", async (_nome, content) => {
    // `(body.content ?? "").trim()` estoura com qualquer não-string.
    const res = await POST(req("POST", { content }), params);

    expect(res.status).toBe(400);
    expect(chatCreate).not.toHaveBeenCalled();
  });

  it("recusa mensagem absurdamente longa", async () => {
    // Texto livre sem teto, gravado no banco, numa rota alcançável por qualquer
    // dono de pedido.
    const res = await POST(req("POST", { content: "a".repeat(5000) }), params);

    expect(res.status).toBe(400);
    expect(chatCreate).not.toHaveBeenCalled();
  });
});

describe("POST — o aviso em tempo real", () => {
  it("avisa o canal do pedido sem mandar o conteúdo", async () => {
    chatCreate.mockResolvedValue({ id: "msg-nova", senderRole: "CUSTOMER" });
    await POST(req("POST", { content: "segredo" }), params);

    const [, , , aviso] = broadcastTenantEvent.mock.calls[0];
    expect(aviso).toEqual({
      orderId: ORDER_ID,
      messageId: "msg-nova",
      senderRole: "CUSTOMER",
    });
    expect(JSON.stringify(aviso)).not.toContain("segredo");
  });

  it("não toca o sino do cliente quando quem falou foi ele mesmo", async () => {
    await POST(req("POST", { content: "oi" }), params);
    expect(broadcastTenantEvent).toHaveBeenCalledTimes(1);
  });

  it("toca o sino do cliente quando quem falou foi o restaurante", async () => {
    auth.mockResolvedValue({ user: { id: "admin-1", name: "Loja", role: "ADMIN" } });
    chatCreate.mockResolvedValue({ id: "msg-nova", senderRole: "ADMIN" });

    await POST(req("POST", { content: "saiu para entrega" }), params);

    expect(broadcastTenantEvent).toHaveBeenCalledTimes(2);
  });

  it("não tenta tocar sino de pedido sem dono", async () => {
    // Pedido de mesa feito por cliente anônimo não tem canal de usuário.
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, userId: null });
    auth.mockResolvedValue({ user: { id: "admin-1", name: "Loja", role: "ADMIN" } });

    await POST(req("POST", { content: "oi" }), params);

    expect(broadcastTenantEvent).toHaveBeenCalledTimes(1);
  });

  it("responde 201 com a mensagem criada", async () => {
    const res = await POST(req("POST", { content: "oi" }), params);
    expect(res.status).toBe(201);
  });
});
