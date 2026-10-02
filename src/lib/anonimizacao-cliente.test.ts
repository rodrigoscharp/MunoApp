/**
 * O pedido de um titular ("apaguem meus dados") não pode apagar os pedidos do
 * restaurante, que são dele e têm valor fiscal. O que sai é o que identifica a
 * pessoa: nome, telefone, endereço, observações, conversa e localização.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const tenantFindUnique = vi.fn();
const userFindFirst = vi.fn();
const userUpdate = vi.fn();
const orderFindMany = vi.fn();
const orderUpdateMany = vi.fn();
const orderItemUpdateMany = vi.fn();
const chatCount = vi.fn();
const chatDeleteMany = vi.fn();
const trackingCount = vi.fn();
const trackingDeleteMany = vi.fn();

const tx = {
  user: { update: (...a: unknown[]) => userUpdate(...a) },
  order: { updateMany: (...a: unknown[]) => orderUpdateMany(...a) },
  orderItem: { updateMany: (...a: unknown[]) => orderItemUpdateMany(...a) },
  chatMessage: { deleteMany: (...a: unknown[]) => chatDeleteMany(...a) },
  deliveryTracking: { deleteMany: (...a: unknown[]) => trackingDeleteMany(...a) },
};

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    tenant: { findUnique: (...a: unknown[]) => tenantFindUnique(...a) },
    user: { findFirst: (...a: unknown[]) => userFindFirst(...a), update: (...a: unknown[]) => userUpdate(...a) },
    order: { findMany: (...a: unknown[]) => orderFindMany(...a) },
    chatMessage: { count: (...a: unknown[]) => chatCount(...a) },
    deliveryTracking: { count: (...a: unknown[]) => trackingCount(...a) },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

import { AnonimizacaoError, contarDadosDoCliente, anonimizarCliente } from "./anonimizacao-cliente";

beforeEach(() => {
  vi.clearAllMocks();
  tenantFindUnique.mockResolvedValue({ id: "t1", slug: "pizzaria", nome: "Pizzaria" });
  userFindFirst.mockResolvedValue(null);
  orderFindMany.mockResolvedValue([]);
  chatCount.mockResolvedValue(0);
  trackingCount.mockResolvedValue(0);
  orderUpdateMany.mockResolvedValue({ count: 0 });
  chatDeleteMany.mockResolvedValue({ count: 0 });
  trackingDeleteMany.mockResolvedValue({ count: 0 });
  orderItemUpdateMany.mockResolvedValue({ count: 0 });
});

describe("quem é o titular", () => {
  it("exige telefone ou e-mail", async () => {
    await expect(contarDadosDoCliente({ slug: "pizzaria" })).rejects.toMatchObject({
      code: "SEM_IDENTIFICADOR",
    });
  });

  it("restaurante que não existe", async () => {
    tenantFindUnique.mockResolvedValue(null);
    await expect(contarDadosDoCliente({ slug: "x", telefone: "11999998888" })).rejects.toMatchObject({
      code: "TENANT_NAO_ENCONTRADO",
    });
  });

  it("acha pedidos pelo telefone ignorando máscara e código do país", async () => {
    orderFindMany.mockResolvedValue([
      { id: "o1", customerPhone: "(11) 99999-8888", userId: null },
      { id: "o2", customerPhone: "+55 11 99999-8888", userId: null },
      { id: "o3", customerPhone: "11 98888-7777", userId: null },
    ]);

    const r = await contarDadosDoCliente({ slug: "pizzaria", telefone: "11999998888" });

    expect(r.pedidos).toBe(2);
  });

  it("só olha pedidos do restaurante informado", async () => {
    await contarDadosDoCliente({ slug: "pizzaria", telefone: "11999998888" });
    expect(orderFindMany.mock.calls[0][0].where.tenantId).toBe("t1");
  });

  it("pelo e-mail, inclui os pedidos da conta do cliente", async () => {
    userFindFirst.mockResolvedValue({ id: "u1", role: "CUSTOMER" });
    orderFindMany.mockResolvedValue([{ id: "o9", customerPhone: null, userId: "u1" }]);

    const r = await contarDadosDoCliente({ slug: "pizzaria", email: "ana@x.com" });

    expect(r.pedidos).toBe(1);
    expect(r.temConta).toBe(true);
  });

  it("recusa anonimizar conta de equipe (ADMIN, KITCHEN, MOTOBOY)", async () => {
    userFindFirst.mockResolvedValue({ id: "u1", role: "ADMIN" });
    await expect(contarDadosDoCliente({ slug: "pizzaria", email: "dono@x.com" })).rejects.toMatchObject({
      code: "CONTA_DE_EQUIPE",
    });
  });
});

describe("anonimizarCliente", () => {
  beforeEach(() => {
    userFindFirst.mockResolvedValue({ id: "u1", role: "CUSTOMER" });
    orderFindMany.mockResolvedValue([{ id: "o1", customerPhone: null, userId: "u1" }]);
  });

  it("zera os dados pessoais do pedido, mas mantém o pedido", async () => {
    await anonimizarCliente({ slug: "pizzaria", email: "ana@x.com" });

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["o1"] }, tenantId: "t1" },
      data: { customerName: null, customerPhone: null, deliveryAddress: null, notes: null },
    });
  });

  it("apaga conversa e localização desses pedidos", async () => {
    await anonimizarCliente({ slug: "pizzaria", email: "ana@x.com" });

    expect(chatDeleteMany).toHaveBeenCalledWith({ where: { orderId: { in: ["o1"] }, tenantId: "t1" } });
    expect(trackingDeleteMany).toHaveBeenCalledWith({ where: { orderId: { in: ["o1"] }, tenantId: "t1" } });
  });

  it("limpa a observação dos itens (restrições alimentares são dado de saúde)", async () => {
    await anonimizarCliente({ slug: "pizzaria", email: "ana@x.com" });
    expect(orderItemUpdateMany).toHaveBeenCalledWith({
      where: { orderId: { in: ["o1"] }, tenantId: "t1" },
      data: { notes: null },
    });
  });

  it("descaracteriza a conta: nome, e-mail inutilizável e sem senha", async () => {
    await anonimizarCliente({ slug: "pizzaria", email: "ana@x.com" });

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { name: "Cliente removido", email: "removido+u1@invalid.local", password: null },
    });
  });

  it("sem conta (só telefone), não mexe em usuário", async () => {
    userFindFirst.mockResolvedValue(null);
    orderFindMany.mockResolvedValue([{ id: "o1", customerPhone: "11999998888", userId: null }]);

    await anonimizarCliente({ slug: "pizzaria", telefone: "11999998888" });

    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("não faz nada quando não há o que anonimizar", async () => {
    userFindFirst.mockResolvedValue(null);
    orderFindMany.mockResolvedValue([]);

    const r = await anonimizarCliente({ slug: "pizzaria", telefone: "11999998888" });

    expect(r.pedidos).toBe(0);
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });
});

it("AnonimizacaoError carrega o código", () => {
  expect(new AnonimizacaoError("SEM_IDENTIFICADOR", "x").code).toBe("SEM_IDENTIFICADOR");
});
