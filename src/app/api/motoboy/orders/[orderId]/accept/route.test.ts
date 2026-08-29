/**
 * A tomada da corrida pelo motoboy.
 *
 * O valor deste teste está numa linha só: a aceitação precisa ser **uma escrita
 * condicional**, não "consultar, conferir, escrever". Com a conferência
 * separada, dois motoboys tocando o botão no mesmo segundo passavam os dois e o
 * segundo UPDATE sobrescrevia o primeiro em silêncio — duas pessoas saíam para a
 * mesma entrega. Um teste que só checasse o 200 do caminho feliz não veria
 * diferença entre as duas implementações; por isso aqui se afirma o formato do
 * `where`.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const TENANT = "restaurante-a";
const ORDER_ID = "pedido-1";
const MOTOBOY_ID = "motoboy-1";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const orderUpdateMany = vi.fn();
const orderFindUnique = vi.fn();
const orderFindUniqueOrThrow = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      updateMany: (...a: unknown[]) => orderUpdateMany(...a),
      findUnique: (...a: unknown[]) => orderFindUnique(...a),
      findUniqueOrThrow: (...a: unknown[]) => orderFindUniqueOrThrow(...a),
    },
  },
}));

const broadcastOrderUpdate = vi.fn();
vi.mock("@/lib/realtime", () => ({
  broadcastOrderUpdate: (...a: unknown[]) => broadcastOrderUpdate(...a),
  broadcastTenantEvent: vi.fn(),
}));

import { POST } from "./route";

function req(comTenant = true) {
  return new Request(`http://localhost/api/motoboy/orders/${ORDER_ID}/accept`, {
    method: "POST",
    headers: comTenant ? { "x-tenant-id": TENANT } : {},
  });
}

const params = { params: Promise.resolve({ orderId: ORDER_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: MOTOBOY_ID, role: "MOTOBOY" } });
  orderUpdateMany.mockResolvedValue({ count: 1 });
  orderFindUniqueOrThrow.mockResolvedValue({ id: ORDER_ID, status: "OUT_FOR_DELIVERY" });
  orderFindUnique.mockResolvedValue(null);
});

describe("quem pode aceitar", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await POST(req(false), params);
    expect(res.status).toBe(400);
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it("recusa visitante sem sessão", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(req(), params);
    expect(res.status).toBe(401);
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it.each(["CUSTOMER", "KITCHEN"])("recusa role %s", async (role) => {
    auth.mockResolvedValue({ user: { id: "u", role } });
    const res = await POST(req(), params);
    expect(res.status).toBe(401);
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it.each(["MOTOBOY", "ADMIN"])("aceita role %s", async (role) => {
    auth.mockResolvedValue({ user: { id: MOTOBOY_ID, role } });
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
  });
});

describe("a corrida entre dois motoboys", () => {
  it("decide a tomada numa única escrita condicional", async () => {
    await POST(req(), params);

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: {
        id: ORDER_ID,
        status: "READY",
        deliveryType: "DELIVERY",
        // A condição que resolve a corrida: só pega quem encontrar o campo nulo.
        motoboyId: null,
      },
      data: { status: "OUT_FOR_DELIVERY", motoboyId: MOTOBOY_ID },
    });
  });

  it("não lê o pedido antes de escrever, no caminho feliz", async () => {
    // Ler para conferir e depois escrever é exatamente o bug que a escrita
    // condicional eliminou.
    await POST(req(), params);
    expect(orderFindUnique).not.toHaveBeenCalled();
  });

  it("devolve 409 para o segundo motoboy", async () => {
    orderUpdateMany.mockResolvedValue({ count: 0 });
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, motoboyId: "outro-motoboy" });

    const res = await POST(req(), params);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Pedido já foi aceito por outro motoboy" });
  });

  it("grava o motoboy da sessão, não um id vindo de fora", async () => {
    await POST(req(), params);
    expect(orderUpdateMany.mock.calls[0][0].data.motoboyId).toBe(MOTOBOY_ID);
  });
});

describe("quando a escrita não pega", () => {
  beforeEach(() => {
    orderUpdateMany.mockResolvedValue({ count: 0 });
  });

  it("404 quando o pedido não existe no restaurante da request", async () => {
    orderFindUnique.mockResolvedValue(null);
    const res = await POST(req(), params);
    expect(res.status).toBe(404);
  });

  it("400 quando o pedido existe mas não está pronto para sair", async () => {
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, motoboyId: null, status: "IN_PREPARATION" });
    const res = await POST(req(), params);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Pedido não disponível para entrega" });
  });

  it("não avisa ninguém quando nada mudou", async () => {
    orderFindUnique.mockResolvedValue(null);
    await POST(req(), params);
    expect(broadcastOrderUpdate).not.toHaveBeenCalled();
  });
});

describe("depois de aceitar", () => {
  it("avisa o acompanhamento do pedido", async () => {
    const pedido = { id: ORDER_ID, status: "OUT_FOR_DELIVERY" };
    orderFindUniqueOrThrow.mockResolvedValue(pedido);

    await POST(req(), params);

    expect(broadcastOrderUpdate).toHaveBeenCalledWith(TENANT, pedido);
  });

  it("devolve o pedido já atualizado", async () => {
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "OUT_FOR_DELIVERY" });
  });

  it("devolve 500 sem detalhe interno quando o banco falha", async () => {
    orderUpdateMany.mockRejectedValue(new Error("deadlock detected"));
    const res = await POST(req(), params);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Erro interno do servidor" });
  });
});
