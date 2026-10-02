/**
 * Quem pode ouvir o quê. O nome secreto de um canal (realtime-topic.ts) só sai
 * daqui depois de conferir a permissão, e é isso que impede um estranho de
 * escutar a fila de pedidos de um restaurante ou o GPS de um motoboy.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "restaurante-a";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const orderFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findUnique: (...a: unknown[]) => orderFindUnique(...a) } },
}));

import { GET } from "./route";
import { topicoSeguro } from "@/lib/realtime-topic";

function req(query: string, tenant: string | null = TENANT) {
  return new NextRequest(`http://localhost/api/realtime/topic?${query}`, {
    headers: tenant ? { "x-tenant-id": tenant } : {},
  });
}

const como = (role: string, id = "u1") => auth.mockResolvedValue({ user: { id, role } });

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue(null);
  orderFindUnique.mockResolvedValue({ userId: "dono-1" });
});

describe("canal da cozinha", () => {
  it.each(["ADMIN", "KITCHEN", "MOTOBOY"])("%s recebe o tópico", async (role) => {
    como(role);
    const res = await GET(req("canal=kitchen"));
    expect(res.status).toBe(200);
    expect((await res.json()).topic).toBe(topicoSeguro(TENANT, "kitchen-orders"));
  });

  it("cliente comum não recebe", async () => {
    como("CUSTOMER");
    expect((await GET(req("canal=kitchen"))).status).toBe(403);
  });

  it("anônimo não recebe", async () => {
    expect((await GET(req("canal=kitchen"))).status).toBe(403);
  });
});

describe("canal do pedido", () => {
  it("o dono recebe", async () => {
    como("CUSTOMER", "dono-1");
    const res = await GET(req("canal=order&id=o1"));
    expect((await res.json()).topic).toBe(topicoSeguro(TENANT, "order:o1"));
  });

  it("ADMIN recebe", async () => {
    como("ADMIN");
    expect((await GET(req("canal=order&id=o1"))).status).toBe(200);
  });

  it("outro cliente logado leva 404, como na leitura do pedido", async () => {
    como("CUSTOMER", "intruso");
    expect((await GET(req("canal=order&id=o1"))).status).toBe(404);
  });

  it("pedido de mesa, sem dono, é acompanhável por quem tem o link", async () => {
    orderFindUnique.mockResolvedValue({ userId: null });
    expect((await GET(req("canal=order&id=o1"))).status).toBe(200);
  });

  it("pedido que não existe neste restaurante leva 404", async () => {
    orderFindUnique.mockResolvedValue(null);
    expect((await GET(req("canal=order&id=o1"))).status).toBe(404);
  });

  it("sem id é 400", async () => {
    como("ADMIN");
    expect((await GET(req("canal=order"))).status).toBe(400);
  });
});

describe("canal do usuário", () => {
  it("devolve sempre o canal do próprio usuário, ignorando o id pedido", async () => {
    como("CUSTOMER", "eu");
    const res = await GET(req("canal=user&id=outra-pessoa"));
    expect((await res.json()).topic).toBe(topicoSeguro(TENANT, "user:eu"));
  });

  it("anônimo não tem canal de usuário", async () => {
    expect((await GET(req("canal=user"))).status).toBe(401);
  });
});

describe("entrada inválida", () => {
  it("canal desconhecido é 400", async () => {
    como("ADMIN");
    expect((await GET(req("canal=outro"))).status).toBe(400);
  });

  it("sem tenant resolvido pelo proxy é 400", async () => {
    como("ADMIN");
    expect((await GET(req("canal=kitchen", null))).status).toBe(400);
  });

  it("nunca é cacheado", async () => {
    como("ADMIN");
    expect((await GET(req("canal=kitchen"))).headers.get("Cache-Control")).toBe("no-store");
  });
});
