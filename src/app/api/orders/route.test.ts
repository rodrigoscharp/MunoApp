/**
 * POST /api/orders é o endpoint onde o dinheiro é decidido, e é público: a UI
 * esconder um botão não impede ninguém de chamar direto com o corpo que quiser.
 *
 * O eixo destes testes é um só — **nada que define preço pode vir da
 * requisição**. Preço do item, frete e desconto saem do banco; o corpo só diz
 * *qual* item, *qual* zona e *qual* código de cupom. O resto são as portas de
 * autorização (login, plano, mesa) e a costura que a extensão de tenant não
 * alcança sozinha.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "restaurante-a";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const menuItemFindMany = vi.fn();
const deliveryZoneFindUnique = vi.fn();
const couponFindUnique = vi.fn();
const orderCount = vi.fn();
const orderCreate = vi.fn();
const settingFindUnique = vi.fn();
const tableFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    menuItem: { findMany: (...a: unknown[]) => menuItemFindMany(...a) },
    deliveryZone: { findUnique: (...a: unknown[]) => deliveryZoneFindUnique(...a) },
    coupon: { findUnique: (...a: unknown[]) => couponFindUnique(...a) },
    order: {
      count: (...a: unknown[]) => orderCount(...a),
      create: (...a: unknown[]) => orderCreate(...a),
    },
    setting: { findUnique: (...a: unknown[]) => settingFindUnique(...a) },
    table: { findFirst: (...a: unknown[]) => tableFindFirst(...a) },
  },
}));

const broadcastTenantEvent = vi.fn();
vi.mock("@/lib/realtime", () => ({
  broadcastTenantEvent: (...a: unknown[]) => broadcastTenantEvent(...a),
}));

const getEnabledPaymentMethods = vi.fn();
vi.mock("@/lib/payments/factory", () => ({
  getEnabledPaymentMethods: (...a: unknown[]) => getEnabledPaymentMethods(...a),
}));

import { POST } from "./route";

type Corpo = Record<string, unknown>;

function req(body: Corpo, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/orders", {
    method: "POST",
    headers: {
      "x-tenant-id": TENANT,
      "x-tenant-plano": "MEMBRO",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/** Pedido mínimo válido de retirada, com um item de R$ 10. */
const pedidoBase: Corpo = {
  items: [{ menuItemId: "item-1", quantity: 2 }],
  paymentMethod: "PIX",
  deliveryType: "PICKUP",
};

/** O que o banco devolve para `dadosCriados()`. */
function dadosCriados() {
  return orderCreate.mock.calls[0][0].data;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "cliente-1", role: "CUSTOMER" } });
  getEnabledPaymentMethods.mockResolvedValue(["PIX", "CREDIT_CARD", "CASH"]);
  menuItemFindMany.mockResolvedValue([{ id: "item-1", price: 10, available: true }]);
  deliveryZoneFindUnique.mockResolvedValue(null);
  couponFindUnique.mockResolvedValue(null);
  orderCount.mockResolvedValue(0);
  settingFindUnique.mockResolvedValue(null);
  tableFindFirst.mockResolvedValue(null);
  orderCreate.mockResolvedValue({ id: "pedido-1", items: [] });
});

describe("porta de entrada", () => {
  it("recusa requisição sem tenant resolvido pelo proxy", async () => {
    const semTenant = new NextRequest("http://localhost/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pedidoBase),
    });
    const res = await POST(semTenant);
    expect(res.status).toBe(400);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it("recusa corpo sem itens", async () => {
    const res = await POST(req({ ...pedidoBase, items: [] }));
    expect(res.status).toBe(400);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it("recusa quantidade zero ou negativa", async () => {
    const res = await POST(req({ ...pedidoBase, items: [{ menuItemId: "item-1", quantity: 0 }] }));
    expect(res.status).toBe(400);
  });

  it("recusa método de pagamento fora do enum", async () => {
    const res = await POST(req({ ...pedidoBase, paymentMethod: "BOLETO" }));
    expect(res.status).toBe(400);
  });
});

describe("quem precisa estar logado", () => {
  it("exige login para retirada", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(req(pedidoBase));
    expect(res.status).toBe(401);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it("exige login para entrega", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(
      req({ ...pedidoBase, deliveryType: "DELIVERY", customerPhone: "11999998888" })
    );
    expect(res.status).toBe(401);
  });

  it("dispensa login na mesa, onde o cliente já está no restaurante", async () => {
    auth.mockResolvedValue(null);
    tableFindFirst.mockResolvedValue({ id: "mesa-1" });
    const res = await POST(
      req({ ...pedidoBase, deliveryType: "DINE_IN", tableId: "mesa-1" }, { "x-tenant-plano": "MEMBRO_MESA_QR" })
    );
    expect(res.status).toBe(201);
    expect(dadosCriados().userId).toBeNull();
  });
});

describe("plano", () => {
  it("recusa pedido de mesa em restaurante sem o plano de mesa QR", async () => {
    const res = await POST(req({ ...pedidoBase, deliveryType: "DINE_IN", tableId: "mesa-1" }));
    expect(res.status).toBe(403);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it("recusa quando o header de plano não veio, em vez de liberar por omissão", async () => {
    const semPlano = new NextRequest("http://localhost/api/orders", {
      method: "POST",
      headers: { "x-tenant-id": TENANT, "Content-Type": "application/json" },
      body: JSON.stringify({ ...pedidoBase, deliveryType: "DINE_IN", tableId: "mesa-1" }),
    });
    const res = await POST(semPlano);
    expect(res.status).toBe(403);
  });
});

describe("o preço não vem da requisição", () => {
  it("calcula o total a partir do preço do banco, ignorando o do corpo", async () => {
    menuItemFindMany.mockResolvedValue([{ id: "item-1", price: 10, available: true }]);
    const res = await POST(
      req({
        ...pedidoBase,
        items: [{ menuItemId: "item-1", quantity: 2, price: 0.01 }],
        total: 0.02,
        discount: 999,
      })
    );

    expect(res.status).toBe(201);
    // 2 unidades × R$ 10, sem frete na retirada e sem cupom.
    expect(dadosCriados().total).toBe(20);
    expect(dadosCriados().discount).toBe(0);
  });

  it("grava o unitPrice do banco em cada item, não o enviado", async () => {
    await POST(req({ ...pedidoBase, items: [{ menuItemId: "item-1", quantity: 2, unitPrice: 0.5 }] }));
    expect(dadosCriados().items.create[0].unitPrice).toBe(10);
  });

  it("ignora deliveryFee enviado no corpo da retirada", async () => {
    await POST(req({ ...pedidoBase, deliveryFee: 50 }));
    expect(dadosCriados().deliveryFee).toBe(0);
    expect(dadosCriados().total).toBe(20);
  });

  it("cobra o frete da zona cadastrada, não o do corpo", async () => {
    deliveryZoneFindUnique.mockResolvedValue({ id: "zona-1", price: 7.5, active: true });
    await POST(
      req({
        ...pedidoBase,
        deliveryType: "DELIVERY",
        customerPhone: "11999998888",
        deliveryAddress: "Rua A, 1",
        deliveryZoneId: "zona-1",
        deliveryFee: 0,
      })
    );
    expect(dadosCriados().deliveryFee).toBe(7.5);
    expect(dadosCriados().total).toBe(27.5);
  });
});

describe("itens", () => {
  it("recusa item que saiu do ar antes de o carrinho ser enviado", async () => {
    menuItemFindMany.mockResolvedValue([]);
    const res = await POST(req(pedidoBase));

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Um ou mais itens do carrinho não estão mais disponíveis.",
    });
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it("recusa quando só parte do carrinho continua disponível", async () => {
    menuItemFindMany.mockResolvedValue([{ id: "item-1", price: 10, available: true }]);
    const res = await POST(
      req({
        ...pedidoBase,
        items: [
          { menuItemId: "item-1", quantity: 1 },
          { menuItemId: "item-2", quantity: 1 },
        ],
      })
    );
    expect(res.status).toBe(422);
  });

  it("busca apenas itens disponíveis, e o escopo de tenant faz o resto", async () => {
    await POST(req(pedidoBase));
    expect(menuItemFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["item-1"] }, available: true },
    });
  });

  it("carimba tenantId em cada OrderItem, que a escrita aninhada não escopa", async () => {
    // A extensão do Prisma intercepta a operação do topo (order.create) e não
    // alcança o `items.create` aninhado — ver src/lib/tenant-scoped-models.ts.
    await POST(req({ ...pedidoBase, items: [{ menuItemId: "item-1", quantity: 1 }] }));
    expect(dadosCriados().items.create[0].tenantId).toBe(TENANT);
  });
});

describe("pagamento", () => {
  it("recusa método que o restaurante não tem conectado", async () => {
    getEnabledPaymentMethods.mockResolvedValue(["CASH"]);
    const res = await POST(req(pedidoBase));

    expect(res.status).toBe(422);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it("consulta os métodos habilitados do tenant da request", async () => {
    await POST(req(pedidoBase));
    expect(getEnabledPaymentMethods).toHaveBeenCalledWith(TENANT);
  });
});

describe("entrega", () => {
  it("exige telefone para entrega", async () => {
    const res = await POST(
      req({ ...pedidoBase, deliveryType: "DELIVERY", deliveryAddress: "Rua A, 1" })
    );
    expect(res.status).toBe(400);
  });

  it("recusa entrega sem bairro selecionado", async () => {
    const res = await POST(
      req({ ...pedidoBase, deliveryType: "DELIVERY", customerPhone: "11999998888" })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Selecione o bairro de entrega." });
  });

  it("recusa bairro desativado", async () => {
    deliveryZoneFindUnique.mockResolvedValue({ id: "zona-1", price: 7.5, active: false });
    const res = await POST(
      req({
        ...pedidoBase,
        deliveryType: "DELIVERY",
        customerPhone: "11999998888",
        deliveryZoneId: "zona-1",
      })
    );
    expect(res.status).toBe(400);
  });

  it("não grava endereço quando o pedido é retirada", async () => {
    await POST(req({ ...pedidoBase, deliveryAddress: "Rua A, 1" }));
    expect(dadosCriados().deliveryAddress).toBeNull();
  });
});

describe("mesa", () => {
  const pedidoMesa = { ...pedidoBase, deliveryType: "DINE_IN", tableId: "mesa-1" };
  const cabecalhoQr = { "x-tenant-plano": "MEMBRO_MESA_QR" };

  it("recusa mesa que não existe no restaurante da request", async () => {
    // A foreign key de tableId é global e não sabe de tenant: sem esta consulta,
    // o pedido nasceria apontando para a mesa de outra casa.
    tableFindFirst.mockResolvedValue(null);
    const res = await POST(req(pedidoMesa, cabecalhoQr));

    expect(res.status).toBe(422);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it("procura a mesa exigindo que esteja ativa", async () => {
    tableFindFirst.mockResolvedValue({ id: "mesa-1" });
    await POST(req(pedidoMesa, cabecalhoQr));
    expect(tableFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "mesa-1", active: true } })
    );
  });

  it("grava a mesa resolvida pelo banco", async () => {
    tableFindFirst.mockResolvedValue({ id: "mesa-1" });
    await POST(req(pedidoMesa, cabecalhoQr));
    expect(dadosCriados().tableId).toBe("mesa-1");
  });

  it("não amarra mesa a pedido de retirada, mesmo com tableId no corpo", async () => {
    await POST(req({ ...pedidoBase, tableId: "mesa-1" }));
    expect(tableFindFirst).not.toHaveBeenCalled();
    expect(dadosCriados().tableId).toBeNull();
  });
});

describe("cupom", () => {
  const cupomValido = {
    id: "cupom-1",
    code: "PROMO10",
    active: true,
    type: "FIXED",
    value: 5,
    // Decimal @default(0) no schema, nunca nulo.
    minOrder: 0,
    validFrom: null,
    validUntil: null,
  };

  it("recusa cupom inexistente com 400", async () => {
    couponFindUnique.mockResolvedValue(null);
    const res = await POST(req({ ...pedidoBase, couponCode: "NAOEXISTE" }));

    expect(res.status).toBe(400);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it("aplica o desconto vindo do banco", async () => {
    couponFindUnique.mockResolvedValue(cupomValido);
    const res = await POST(req({ ...pedidoBase, couponCode: "promo10" }));

    expect(res.status).toBe(201);
    expect(dadosCriados().discount).toBe(5);
    expect(dadosCriados().total).toBe(15);
    expect(dadosCriados().couponId).toBe("cupom-1");
  });

  it("normaliza o código antes de procurar", async () => {
    couponFindUnique.mockResolvedValue(cupomValido);
    await POST(req({ ...pedidoBase, couponCode: "  promo10 " }));
    expect(couponFindUnique).toHaveBeenCalledWith({
      where: { tenantId_code: { tenantId: TENANT, code: "PROMO10" } },
    });
  });

  it("não procura cupom quando o corpo não manda código", async () => {
    await POST(req(pedidoBase));
    expect(couponFindUnique).not.toHaveBeenCalled();
    expect(dadosCriados().couponId).toBeNull();
  });
});

describe("depois de criado", () => {
  it("usa o tempo estimado configurado pelo admin", async () => {
    settingFindUnique.mockResolvedValue({ value: "90" });
    const antes = Date.now();
    await POST(req(pedidoBase));

    const estimado = (dadosCriados().estimatedDeliveryAt as Date).getTime();
    expect(estimado).toBeGreaterThanOrEqual(antes + 90 * 60_000);
  });

  it("cai em 45 minutos quando não há configuração", async () => {
    settingFindUnique.mockResolvedValue(null);
    const antes = Date.now();
    await POST(req(pedidoBase));

    const estimado = (dadosCriados().estimatedDeliveryAt as Date).getTime();
    expect(estimado).toBeGreaterThanOrEqual(antes + 45 * 60_000);
    expect(estimado).toBeLessThan(antes + 46 * 60_000);
  });

  it("avisa a cozinha do pedido novo", async () => {
    await POST(req(pedidoBase));
    expect(broadcastTenantEvent).toHaveBeenCalledWith(
      TENANT,
      "kitchen-orders",
      "order-created",
      { orderId: "pedido-1" }
    );
  });

  it("responde 201 com o pedido criado", async () => {
    const res = await POST(req(pedidoBase));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: "pedido-1" });
  });

  it("devolve 500 sem vazar detalhe interno quando o banco falha", async () => {
    orderCreate.mockRejectedValue(new Error("connection terminated"));
    const res = await POST(req(pedidoBase));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Erro interno do servidor" });
  });
});
