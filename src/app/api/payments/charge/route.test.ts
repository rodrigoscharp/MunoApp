/**
 * A cobrança de um pedido já criado.
 *
 * O caminho de erro desta rota **cancela o pedido** — foi por isso que a falta de
 * guarda de acesso aqui era grave: com um id conhecido, qualquer pessoa derrubava
 * o pedido de outro cliente. Os testes de autorização abaixo existem por causa
 * disso, e o 404 (em vez de 403) é parte do contrato: um 403 confirmaria que o
 * pedido existe.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "restaurante-a";
const ORDER_ID = "pedido-1";
const DONO = "cliente-1";

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

const getActiveConnection = vi.fn();
const createCharge = vi.fn();
const providerMeta = { methods: ["PIX", "CREDIT_CARD"] };
vi.mock("@/lib/payments/factory", () => ({
  getActiveConnection: (...a: unknown[]) => getActiveConnection(...a),
  getPaymentProvider: () => ({
    meta: providerMeta,
    createCharge: (...a: unknown[]) => createCharge(...a),
  }),
}));

import { POST } from "./route";

type Corpo = Record<string, unknown>;

function req(body: Corpo = {}, comTenant = true) {
  return new NextRequest("http://localhost/api/payments/charge", {
    method: "POST",
    headers: {
      ...(comTenant ? { "x-tenant-id": TENANT } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      orderId: ORDER_ID,
      paymentMethod: "PIX",
      customerName: "Cliente",
      ...body,
    }),
  });
}

const pedido = (over: Corpo = {}) => ({
  id: ORDER_ID,
  userId: DONO,
  total: 42.5,
  status: "PENDING",
  paymentStatus: "UNPAID",
  items: [
    {
      menuItemId: "item-1",
      quantity: 2,
      unitPrice: 10,
      menuItem: { name: "X-Salada" },
    },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  providerMeta.methods = ["PIX", "CREDIT_CARD"];
  auth.mockResolvedValue({ user: { id: DONO, role: "CUSTOMER" } });
  orderFindUnique.mockResolvedValue(pedido());
  orderUpdate.mockResolvedValue({});
  getActiveConnection.mockResolvedValue({ id: "conn-1", provider: "stripe" });
  createCharge.mockResolvedValue({
    paymentId: "pay_123",
    pixQrCode: "qr",
    pixCopyPaste: "copia-e-cola",
    checkoutUrl: null,
  });
});

describe("porta de entrada", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await POST(req({}, false));
    expect(res.status).toBe(400);
  });

  it.each([
    ["sem orderId", { orderId: undefined }],
    ["método fora do enum", { paymentMethod: "CASH" }],
    ["sem nome do pagador", { customerName: undefined }],
  ])("recusa corpo %s", async (_nome, corpo) => {
    const body = { orderId: ORDER_ID, paymentMethod: "PIX", customerName: "C", ...corpo };
    const r = new NextRequest("http://localhost/api/payments/charge", {
      method: "POST",
      headers: { "x-tenant-id": TENANT, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await POST(r);
    expect(res.status).toBe(400);
    expect(createCharge).not.toHaveBeenCalled();
  });
});

describe("quem pode cobrar o pedido", () => {
  it("permite o dono do pedido", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
  });

  it("permite o ADMIN do restaurante", async () => {
    auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    const res = await POST(req());
    expect(res.status).toBe(200);
  });

  it("permite pedido de mesa sem dono, acessível por link", async () => {
    orderFindUnique.mockResolvedValue(pedido({ userId: null }));
    auth.mockResolvedValue(null);
    const res = await POST(req());
    expect(res.status).toBe(200);
  });

  it("responde 404 para outro cliente logado, sem cancelar o pedido", async () => {
    auth.mockResolvedValue({ user: { id: "intruso", role: "CUSTOMER" } });
    const res = await POST(req());

    expect(res.status).toBe(404);
    expect(createCharge).not.toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("responde 404 para visitante sem sessão", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(req());

    expect(res.status).toBe(404);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("responde 404, e não 403, para pedido inexistente — mesma resposta", async () => {
    orderFindUnique.mockResolvedValue(null);
    const res = await POST(req());

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Pedido não encontrado" });
  });
});

describe("cobrança que não se repete", () => {
  it("recusa pedido já pago", async () => {
    orderFindUnique.mockResolvedValue(pedido({ paymentStatus: "PAID" }));
    const res = await POST(req());

    expect(res.status).toBe(409);
    expect(createCharge).not.toHaveBeenCalled();
  });

  it("recusa pedido cancelado", async () => {
    orderFindUnique.mockResolvedValue(pedido({ status: "CANCELLED" }));
    const res = await POST(req());

    expect(res.status).toBe(409);
    expect(createCharge).not.toHaveBeenCalled();
  });
});

describe("gateway do lojista", () => {
  it("recusa quando o restaurante não tem conexão ativa", async () => {
    getActiveConnection.mockResolvedValue(null);
    const res = await POST(req());

    expect(res.status).toBe(409);
    expect(createCharge).not.toHaveBeenCalled();
  });

  it("consulta a conexão do tenant da request", async () => {
    await POST(req());
    expect(getActiveConnection).toHaveBeenCalledWith(TENANT);
  });

  it("recusa método que o gateway conectado não cobre", async () => {
    providerMeta.methods = ["PIX"];
    const res = await POST(req({ paymentMethod: "CREDIT_CARD" }));

    expect(res.status).toBe(422);
    expect(createCharge).not.toHaveBeenCalled();
  });
});

describe("o valor cobrado sai do pedido gravado", () => {
  it("cobra o total do banco, não um valor do corpo", async () => {
    await POST(req({ total: 1, amount: 1 }));
    expect(createCharge.mock.calls[0][0]).toMatchObject({ id: ORDER_ID, total: 42.5 });
  });

  it("monta os itens com o unitPrice gravado no pedido", async () => {
    await POST(req());
    expect(createCharge.mock.calls[0][0].items).toEqual([
      { menuItemId: "item-1", name: "X-Salada", quantity: 2, unitPrice: 10 },
    ]);
  });

  it("repassa o CPF do pagador ao adapter", async () => {
    await POST(req({ payerDocument: "39053344705" }));
    expect(createCharge.mock.calls[0][0].payerDocument).toBe("39053344705");
  });

  it("guarda o id da cobrança no pedido", async () => {
    await POST(req());
    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: ORDER_ID },
      data: { mpPaymentId: "pay_123" },
    });
  });

  it("devolve ao checkout os dados do PIX", async () => {
    const res = await POST(req());
    expect(await res.json()).toEqual({
      pixQrCode: "qr",
      pixCopyPaste: "copia-e-cola",
      checkoutUrl: null,
      paymentId: "pay_123",
    });
  });
});

describe("quando o gateway falha", () => {
  beforeEach(() => {
    createCharge.mockRejectedValue(new Error("gateway fora do ar"));
  });

  it("cancela o pedido para ele não chegar à cozinha sem pagamento", async () => {
    const res = await POST(req());

    expect(res.status).toBe(500);
    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: ORDER_ID },
      data: { status: "CANCELLED" },
    });
  });

  it("responde 500 mesmo se o cancelamento também falhar", async () => {
    orderUpdate.mockRejectedValue(new Error("banco fora"));
    const res = await POST(req());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Não foi possível iniciar o pagamento. O pedido foi cancelado.",
    });
  });

  it("não devolve ao cliente a mensagem crua do gateway", async () => {
    // O erro do gateway pode embutir o corpo da request, que inclui o
    // access_token usado na chamada.
    createCharge.mockRejectedValue(new Error("401 access_token=sk_live_segredo"));
    const res = await POST(req());

    expect(JSON.stringify(await res.json())).not.toContain("sk_live_segredo");
  });
});
