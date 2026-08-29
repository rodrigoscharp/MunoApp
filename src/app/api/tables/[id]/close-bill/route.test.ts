/**
 * Fechamento da conta da mesa.
 *
 * É a rota que marca pedido como pago sem passar por gateway nenhum — a
 * conferência é humana, feita pelo ADMIN no balcão. Por isso as guardas que
 * importam aqui são de autorização e de soma: quem fecha precisa ser ADMIN do
 * restaurante, e o que foi recebido não pode ser menor que o que está em aberto.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "restaurante-a";
const MESA_ID = "mesa-1";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const orderFindMany = vi.fn();
const orderUpdateMany = vi.fn();
const paymentCreateMany = vi.fn();
const transacao = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findMany: (...a: unknown[]) => orderFindMany(...a),
      updateMany: (...a: unknown[]) => orderUpdateMany(...a),
    },
    payment: { createMany: (...a: unknown[]) => paymentCreateMany(...a) },
    $transaction: (...a: unknown[]) => transacao(...a),
  },
}));

import { POST } from "./route";

const params = { params: Promise.resolve({ id: MESA_ID }) };

function req(
  body: Record<string, unknown>,
  { tenant = true, plano = "MEMBRO_MESA_QR" }: { tenant?: boolean; plano?: string | null } = {}
) {
  return new NextRequest(`http://localhost/api/tables/${MESA_ID}/close-bill`, {
    method: "POST",
    headers: {
      ...(tenant ? { "x-tenant-id": TENANT } : {}),
      ...(plano ? { "x-tenant-plano": plano } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const contaDe100 = { payments: [{ method: "CASH", amount: 100 }] };

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  orderFindMany.mockResolvedValue([{ total: 60 }, { total: 40 }]);
  orderUpdateMany.mockReturnValue("op-update");
  paymentCreateMany.mockReturnValue("op-create");
  transacao.mockResolvedValue([{ count: 2 }, { count: 1 }]);
});

describe("quem pode fechar a conta", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await POST(req(contaDe100, { tenant: false }), params);
    expect(res.status).toBe(400);
    expect(transacao).not.toHaveBeenCalled();
  });

  it("recusa restaurante sem o plano de mesa QR", async () => {
    const res = await POST(req(contaDe100, { plano: "MEMBRO" }), params);
    expect(res.status).toBe(403);
    expect(transacao).not.toHaveBeenCalled();
  });

  it("recusa quando o header de plano não veio, em vez de liberar", async () => {
    const res = await POST(req(contaDe100, { plano: null }), params);
    expect(res.status).toBe(403);
  });

  it("recusa visitante sem sessão", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(req(contaDe100), params);
    expect(res.status).toBe(403);
    expect(transacao).not.toHaveBeenCalled();
  });

  it.each(["CUSTOMER", "KITCHEN", "MOTOBOY"])("recusa role %s", async (role) => {
    auth.mockResolvedValue({ user: { id: "u", role } });
    const res = await POST(req(contaDe100), params);
    expect(res.status).toBe(403);
    expect(transacao).not.toHaveBeenCalled();
  });
});

describe("corpo do fechamento", () => {
  it.each([
    ["sem formas de pagamento", { payments: [] }],
    ["valor zero", { payments: [{ method: "CASH", amount: 0 }] }],
    ["valor negativo", { payments: [{ method: "CASH", amount: -50 }] }],
    ["método inexistente", { payments: [{ method: "CRIPTO", amount: 100 }] }],
  ])("recusa %s", async (_nome, corpo) => {
    const res = await POST(req(corpo), params);
    expect(res.status).toBe(400);
    expect(transacao).not.toHaveBeenCalled();
  });

  it("aceita conta dividida em várias formas", async () => {
    const res = await POST(
      req({
        payments: [
          { method: "CASH", amount: 50 },
          { method: "PIX", amount: 30 },
          { method: "CREDIT_CARD", amount: 20 },
        ],
      }),
      params
    );
    expect(res.status).toBe(200);
  });
});

describe("a soma precisa cobrir o que está em aberto", () => {
  it("recusa mesa sem pedido em aberto", async () => {
    orderFindMany.mockResolvedValue([]);
    const res = await POST(req(contaDe100), params);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Nenhum pedido em aberto nesta mesa" });
    expect(transacao).not.toHaveBeenCalled();
  });

  it("recusa pagamento menor que o total em aberto", async () => {
    const res = await POST(req({ payments: [{ method: "CASH", amount: 80 }] }), params);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("100.00");
    expect(transacao).not.toHaveBeenCalled();
  });

  it("aceita pagamento exato", async () => {
    const res = await POST(req(contaDe100), params);
    expect(res.status).toBe(200);
  });

  it("aceita pagamento maior, que é a gorjeta de 10% calculada na tela", async () => {
    const res = await POST(req({ payments: [{ method: "CASH", amount: 110 }] }), params);
    expect(res.status).toBe(200);
  });

  it("tolera centavo de arredondamento a menos", async () => {
    const res = await POST(req({ payments: [{ method: "CASH", amount: 99.995 }] }), params);
    expect(res.status).toBe(200);
  });

  it("só soma pedidos não pagos e não cancelados da mesa", async () => {
    await POST(req(contaDe100), params);
    expect(orderFindMany).toHaveBeenCalledWith({
      where: { tableId: MESA_ID, paymentStatus: "UNPAID", status: { not: "CANCELLED" } },
      select: { total: true },
    });
  });
});

describe("a gravação", () => {
  it("marca os pedidos e registra os pagamentos na mesma transação", async () => {
    await POST(req(contaDe100), params);

    expect(transacao).toHaveBeenCalledWith(["op-update", "op-create"]);
  });

  it("fecha exatamente os mesmos pedidos que somou", async () => {
    await POST(req(contaDe100), params);

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { tableId: MESA_ID, paymentStatus: "UNPAID", status: { not: "CANCELLED" } },
      data: { paymentStatus: "PAID" },
    });
  });

  it("carimba tenant e mesa em cada pagamento registrado", async () => {
    await POST(
      req({
        payments: [
          { method: "CASH", amount: 60 },
          { method: "PIX", amount: 40 },
        ],
      }),
      params
    );

    expect(paymentCreateMany).toHaveBeenCalledWith({
      data: [
        { tenantId: TENANT, tableId: MESA_ID, method: "CASH", amount: 60 },
        { tenantId: TENANT, tableId: MESA_ID, method: "PIX", amount: 40 },
      ],
    });
  });

  it("devolve quantos pedidos foram fechados", async () => {
    const res = await POST(req(contaDe100), params);
    expect(await res.json()).toEqual({ ok: true, count: 2 });
  });

  it("devolve 500 genérico quando a transação falha", async () => {
    transacao.mockRejectedValue(new Error("deadlock detected"));
    const res = await POST(req(contaDe100), params);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Erro interno do servidor" });
  });
});
