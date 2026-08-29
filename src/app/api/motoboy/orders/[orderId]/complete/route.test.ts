/**
 * O motoboy conclui a entrega.
 *
 * A guarda aqui é dupla e vale entender a segunda: passar no papel (MOTOBOY ou
 * ADMIN) não basta — o pedido precisa estar atribuído a quem está chamando. É o
 * que impede um motoboy de dar baixa na corrida de outro.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const TENANT = "restaurante-a";
const ORDER_ID = "pedido-1";
const MOTOBOY_ID = "motoboy-1";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const orderFindUnique = vi.fn();
const orderUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: (...a: unknown[]) => orderFindUnique(...a),
      update: (...a: unknown[]) => orderUpdate(...a),
    },
  },
}));

const broadcastOrderUpdate = vi.fn();
vi.mock("@/lib/realtime", () => ({
  broadcastOrderUpdate: (...a: unknown[]) => broadcastOrderUpdate(...a),
  broadcastTenantEvent: vi.fn(),
}));

import { POST } from "./route";

const params = { params: Promise.resolve({ orderId: ORDER_ID }) };

function req(comTenant = true) {
  return new Request(`http://localhost/api/motoboy/orders/${ORDER_ID}/complete`, {
    method: "POST",
    headers: comTenant ? { "x-tenant-id": TENANT } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: MOTOBOY_ID, role: "MOTOBOY" } });
  orderFindUnique.mockResolvedValue({
    id: ORDER_ID,
    motoboyId: MOTOBOY_ID,
    status: "OUT_FOR_DELIVERY",
  });
  orderUpdate.mockResolvedValue({ id: ORDER_ID, status: "DELIVERED" });
});

describe("porta de entrada", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await POST(req(false), params);
    expect(res.status).toBe(400);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("recusa visitante sem sessão", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(req(), params);
    expect(res.status).toBe(401);
  });

  it.each(["CUSTOMER", "KITCHEN"])("recusa role %s", async (role) => {
    auth.mockResolvedValue({ user: { id: "u", role } });
    const res = await POST(req(), params);

    expect(res.status).toBe(401);
    expect(orderFindUnique).not.toHaveBeenCalled();
  });

  it("404 para pedido de outro restaurante ou inexistente", async () => {
    orderFindUnique.mockResolvedValue(null);
    const res = await POST(req(), params);

    expect(res.status).toBe(404);
    expect(orderUpdate).not.toHaveBeenCalled();
  });
});

describe("só quem está com a corrida dá baixa", () => {
  it("conclui a entrega do próprio motoboy", async () => {
    const res = await POST(req(), params);

    expect(res.status).toBe(200);
    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: ORDER_ID },
      data: { status: "DELIVERED" },
    });
  });

  it("recusa motoboy dando baixa na corrida de outro", async () => {
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, motoboyId: "outro-motoboy" });
    const res = await POST(req(), params);

    expect(res.status).toBe(403);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("recusa baixa em pedido que ninguém aceitou", async () => {
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, motoboyId: null });
    const res = await POST(req(), params);

    expect(res.status).toBe(403);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  /**
   * Comportamento atual, registrado porque surpreende: ADMIN passa na checagem
   * de papel lá em cima, mas cai aqui, já que `motoboyId` é do entregador. Na
   * prática o ramo ADMIN só serve quando o próprio admin aceitou a corrida (o
   * accept grava `motoboyId: session.user.id`). Um admin não consegue dar baixa
   * na entrega de um motoboy.
   */
  it("ADMIN que não aceitou a corrida também é recusado", async () => {
    auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, motoboyId: MOTOBOY_ID });

    const res = await POST(req(), params);
    expect(res.status).toBe(403);
  });

  it("ADMIN que aceitou a própria corrida consegue concluir", async () => {
    auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, motoboyId: "admin-1" });

    const res = await POST(req(), params);
    expect(res.status).toBe(200);
  });
});

describe("depois de concluir", () => {
  it("avisa o acompanhamento do pedido", async () => {
    const pedido = { id: ORDER_ID, status: "DELIVERED" };
    orderUpdate.mockResolvedValue(pedido);

    await POST(req(), params);

    expect(broadcastOrderUpdate).toHaveBeenCalledWith(TENANT, pedido);
  });

  it("não avisa ninguém quando a baixa foi recusada", async () => {
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, motoboyId: "outro" });
    await POST(req(), params);
    expect(broadcastOrderUpdate).not.toHaveBeenCalled();
  });

  it("devolve 500 genérico quando o banco falha", async () => {
    orderUpdate.mockRejectedValue(new Error("connection terminated"));
    const res = await POST(req(), params);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Erro interno do servidor" });
  });
});
