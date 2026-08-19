import { describe, expect, it, vi, beforeEach } from "vitest";

const TENANT = "tenant-1";
const ORDER = "order-1";

/**
 * Regressão: o GET era o único handler do arquivo sem tenant nem sessão. Como
 * DeliveryTracking não era escopado e o rastreamento é buscado pelo orderId,
 * qualquer id de pedido devolvia a posição GPS ao vivo do motoboy de qualquer
 * restaurante. O guard é o mesmo da página de track: canViewOrder.
 */

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const orderFindUnique = vi.fn();
const trackingFindUnique = vi.fn();
const trackingUpsert = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findUnique: (...a: unknown[]) => orderFindUnique(...a) },
    deliveryTracking: {
      findUnique: (...a: unknown[]) => trackingFindUnique(...a),
      upsert: (...a: unknown[]) => trackingUpsert(...a),
    },
  },
}));

vi.mock("@/lib/realtime", () => ({ broadcastTenantEvent: vi.fn() }));

import { GET, POST } from "./route";

const TRACKING = { id: "t1", orderId: ORDER, lat: -23.5, lng: -46.6 };

function req(comTenant = true) {
  return new Request("http://localhost/api/motoboy/orders/order-1/location", {
    headers: comTenant ? { "x-tenant-id": TENANT } : {},
  });
}

const params = { params: Promise.resolve({ orderId: ORDER }) };

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue(null);
  trackingFindUnique.mockResolvedValue(TRACKING);
});

describe("GET /api/motoboy/orders/[orderId]/location", () => {
  it("recusa requisição sem tenant resolvido", async () => {
    const res = await GET(req(false), params);
    expect(res.status).toBe(400);
    expect(orderFindUnique).not.toHaveBeenCalled();
  });

  it("devolve 404 quando o pedido não é do tenant da request", async () => {
    // O escopo automático faz o findUnique de outro tenant voltar null.
    orderFindUnique.mockResolvedValue(null);

    const res = await GET(req(), params);
    expect(res.status).toBe(404);
    // O ponto do bug: não pode chegar a consultar o rastreamento.
    expect(trackingFindUnique).not.toHaveBeenCalled();
  });

  it("esconde o rastreamento de pedido com dono para visitante deslogado", async () => {
    orderFindUnique.mockResolvedValue({ userId: "dono" });

    const res = await GET(req(), params);
    expect(res.status).toBe(404);
    expect(trackingFindUnique).not.toHaveBeenCalled();
  });

  it("esconde o rastreamento de um cliente para outro", async () => {
    orderFindUnique.mockResolvedValue({ userId: "dono" });
    auth.mockResolvedValue({ user: { id: "intruso", role: "CUSTOMER" } });

    const res = await GET(req(), params);
    expect(res.status).toBe(404);
    expect(trackingFindUnique).not.toHaveBeenCalled();
  });

  it("entrega o rastreamento para o dono do pedido", async () => {
    orderFindUnique.mockResolvedValue({ userId: "dono" });
    auth.mockResolvedValue({ user: { id: "dono", role: "CUSTOMER" } });

    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ lat: -23.5, lng: -46.6 });
  });

  it("mantém pedido sem dono (mesa e legado) acessível por link direto", async () => {
    orderFindUnique.mockResolvedValue({ userId: null });

    const res = await GET(req(), params);
    expect(res.status).toBe(200);
  });

  it("devolve 404 quando o pedido é visível mas o rastreamento nem começou", async () => {
    orderFindUnique.mockResolvedValue({ userId: null });
    trackingFindUnique.mockResolvedValue(null);

    const res = await GET(req(), params);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: "Rastreamento não iniciado",
    });
  });
});

/**
 * Regressão do POST: o handler exigia o papel MOTOBOY e mais nada. Como o
 * rastreamento é endereçado pelo orderId, qualquer entregador do restaurante
 * empurrava a própria posição para a entrega de um colega — e o `upsert`
 * aceitava, porque motoboyId só é escrito no `create` da primeira vez. O mapa
 * do cliente passava a seguir a moto errada, sem erro em lugar nenhum.
 */
describe("POST /api/motoboy/orders/[orderId]/location", () => {
  function post(corpo: unknown = { lat: -23.5, lng: -46.6 }) {
    return new Request("http://localhost/api/motoboy/orders/order-1/location", {
      method: "POST",
      headers: { "x-tenant-id": TENANT, "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
  }

  beforeEach(() => {
    auth.mockResolvedValue({ user: { id: "moto-1", role: "MOTOBOY" } });
    orderFindUnique.mockResolvedValue({ motoboyId: "moto-1", deliveryAddress: null });
    trackingFindUnique.mockResolvedValue(TRACKING);
    trackingUpsert.mockResolvedValue({ ...TRACKING, updatedAt: new Date() });
  });

  it("recusa o motoboy que não é o desta entrega", async () => {
    orderFindUnique.mockResolvedValue({ motoboyId: "moto-2", deliveryAddress: null });

    const res = await POST(post(), params);
    expect(res.status).toBe(403);
    expect(trackingUpsert).not.toHaveBeenCalled();
  });

  it("recusa entrega ainda sem motoboy designado", async () => {
    orderFindUnique.mockResolvedValue({ motoboyId: null, deliveryAddress: null });

    const res = await POST(post(), params);
    expect(res.status).toBe(403);
    expect(trackingUpsert).not.toHaveBeenCalled();
  });

  it("devolve 404 quando o pedido não é do tenant da request", async () => {
    orderFindUnique.mockResolvedValue(null);

    const res = await POST(post(), params);
    expect(res.status).toBe(404);
    expect(trackingUpsert).not.toHaveBeenCalled();
  });

  it("aceita a posição do motoboy designado", async () => {
    const res = await POST(post(), params);
    expect(res.status).toBe(200);
    expect(trackingUpsert).toHaveBeenCalled();
  });

  it("deixa o ADMIN publicar posição quando o celular do entregador falha", async () => {
    auth.mockResolvedValue({ user: { id: "dono", role: "ADMIN" } });
    orderFindUnique.mockResolvedValue({ motoboyId: "moto-2", deliveryAddress: null });

    const res = await POST(post(), params);
    expect(res.status).toBe(200);
  });

  it("recusa coordenada fora do intervalo geográfico", async () => {
    const res = await POST(post({ lat: 999, lng: -46.6 }), params);
    expect(res.status).toBe(400);
    expect(orderFindUnique).not.toHaveBeenCalled();
  });
});
