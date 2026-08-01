import { describe, expect, it, vi, beforeEach } from "vitest";

type Envio = { event: string; payload: Record<string, unknown> };

const send = vi.fn<(envio: Envio) => Promise<void>>();
const channel = vi.fn<(nome: string) => { send: typeof send }>();

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { channel: (nome: string) => channel(nome) },
}));

import { broadcastOrderUpdate } from "./realtime";

const TENANT = "tenant-1";

function pedido(over: Partial<Parameters<typeof broadcastOrderUpdate>[1]> = {}) {
  return {
    id: "order-1",
    userId: "cliente-1",
    status: "READY",
    deliveryType: "DELIVERY",
    updatedAt: new Date("2026-08-01T12:00:00.000Z"),
    estimatedDeliveryAt: null,
    ...over,
  };
}

/** Nomes de canal que receberam publicação nesta chamada. */
function canaisUsados(): string[] {
  return channel.mock.calls.map(([nome]) => nome);
}

beforeEach(() => {
  vi.clearAllMocks();
  send.mockResolvedValue(undefined);
  channel.mockReturnValue({ send });
});

describe("broadcastOrderUpdate", () => {
  it("publica para o pedido, para a cozinha e para o dono", async () => {
    await broadcastOrderUpdate(TENANT, pedido());

    expect(canaisUsados()).toEqual([
      `tenant:${TENANT}:order:order-1`,
      `tenant:${TENANT}:kitchen-orders`,
      `tenant:${TENANT}:user:cliente-1`,
    ]);
  });

  it("omite o canal do dono quando o pedido não tem dono", async () => {
    // Pedido de mesa (DINE_IN anônimo) e pedidos legados não têm userId.
    await broadcastOrderUpdate(TENANT, pedido({ userId: null }));

    const canais = canaisUsados();
    expect(canais).toHaveLength(2);
    expect(canais.some((c) => c.includes(":user:"))).toBe(false);
  });

  it("nunca cruza o tenant: todo canal começa pelo tenant do pedido", async () => {
    await broadcastOrderUpdate("outro-tenant", pedido());

    for (const canal of canaisUsados()) {
      expect(canal.startsWith("tenant:outro-tenant:")).toBe(true);
    }
  });

  it("manda status e deliveryType para a cozinha, que a lista do motoboy usa para filtrar", async () => {
    await broadcastOrderUpdate(TENANT, pedido());

    const idx = canaisUsados().indexOf(`tenant:${TENANT}:kitchen-orders`);
    expect(send.mock.calls[idx][0]).toMatchObject({
      event: "order-updated",
      payload: { orderId: "order-1", status: "READY", deliveryType: "DELIVERY" },
    });
  });

  it("serializa as datas em ISO e aceita previsão nula", async () => {
    await broadcastOrderUpdate(TENANT, pedido());

    expect(send.mock.calls[0][0]).toMatchObject({
      payload: {
        status: "READY",
        updatedAt: "2026-08-01T12:00:00.000Z",
        estimatedDeliveryAt: null,
      },
    });
  });

  it("propaga a previsão de entrega quando existe", async () => {
    await broadcastOrderUpdate(
      TENANT,
      pedido({ estimatedDeliveryAt: new Date("2026-08-01T12:45:00.000Z") })
    );

    expect(send.mock.calls[0][0]).toMatchObject({
      payload: { estimatedDeliveryAt: "2026-08-01T12:45:00.000Z" },
    });
  });
});
