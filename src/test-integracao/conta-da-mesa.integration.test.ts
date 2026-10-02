/**
 * Fechar a conta da mesa lê, confere e quita numa transação interativa. Os
 * testes de unidade mockam o `$transaction`; aqui se confere que a transação
 * interativa funciona de fato com o cliente estendido (escopo de tenant) e que
 * duas chamadas simultâneas não geram pagamento em dobro.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";

vi.mock("@/lib/auth", () => ({
  auth: async () => ({ user: { id: "admin-1", role: "ADMIN" } }),
}));

import { POST } from "@/app/api/tables/[id]/close-bill/route";
import { criarTenant, limparTenants, pedidoMinimo } from "./apoio";

let tenantId: string;
let mesaId: string;

function fechar(valor = 100) {
  return POST(
    new NextRequest(`http://localhost/api/tables/${mesaId}/close-bill`, {
      method: "POST",
      headers: {
        "x-tenant-id": tenantId,
        "x-tenant-plano": "MEMBRO_MESA_QR",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payments: [{ method: "CASH", amount: valor }] }),
    }),
    { params: Promise.resolve({ id: mesaId }) }
  );
}

beforeAll(async () => {
  const t = await criarTenant("mesa");
  tenantId = t.id;
  const mesa = await prismaUnscoped.table.create({ data: { tenantId, number: 7 } });
  mesaId = mesa.id;
  for (const total of [60, 40]) {
    await prismaUnscoped.order.create({
      data: pedidoMinimo(tenantId, { total, tableId: mesaId, deliveryType: "DINE_IN" }),
    });
  }
});

afterAll(limparTenants);

describe("fechamento da conta da mesa", () => {
  it("duas chamadas simultâneas: uma fecha, a outra é recusada, e há um conjunto de pagamentos só", async () => {
    const [a, b] = await Promise.all([fechar(), fechar()]);
    const status = [a.status, b.status].sort();

    expect(status[0]).toBe(200);
    expect([400, 409]).toContain(status[1]);

    expect(await prismaUnscoped.payment.count({ where: { tableId: mesaId } })).toBe(1);
    expect(
      await prismaUnscoped.order.count({ where: { tableId: mesaId, paymentStatus: "PAID" } })
    ).toBe(2);
  });

  it("pedido que entra depois do fechamento continua em aberto", async () => {
    await prismaUnscoped.order.create({
      data: pedidoMinimo(tenantId, { total: 25, tableId: mesaId, deliveryType: "DINE_IN" }),
    });

    expect(
      await prismaUnscoped.order.count({ where: { tableId: mesaId, paymentStatus: "UNPAID" } })
    ).toBe(1);
  });

  it("soma menor que o total em aberto não quita nada", async () => {
    const res = await fechar(10);
    expect(res.status).toBe(400);
    expect(
      await prismaUnscoped.order.count({ where: { tableId: mesaId, paymentStatus: "UNPAID" } })
    ).toBe(1);
  });
});
