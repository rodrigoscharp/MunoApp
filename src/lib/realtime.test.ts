import { describe, expect, it, vi, beforeEach } from "vitest";

type Envio = { event: string; payload: Record<string, unknown> };

const send = vi.fn<(envio: Envio) => Promise<void>>();
const channel = vi.fn<(nome: string) => { send: typeof send }>();

const removeChannel = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    channel: (nome: string) => channel(nome),
    removeChannel: (...a: unknown[]) => removeChannel(...a),
  },
}));

import { broadcastOrderUpdate, broadcastTenantEvent } from "./realtime";
import { topicoSeguro } from "./realtime-topic";

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

describe("broadcastTenantEvent: o aviso ao vivo não pode atrapalhar o pedido", () => {
  it("solta o canal depois de enviar, para o cliente não acumular tópicos", async () => {
    const canal = { send };
    channel.mockReturnValue(canal);

    await broadcastTenantEvent(TENANT, "kitchen-orders", "order-created", { orderId: "o1" });

    expect(removeChannel).toHaveBeenCalledWith(canal);
  });

  it("solta o canal mesmo quando o envio falha", async () => {
    send.mockRejectedValue(new Error("realtime fora"));

    await broadcastTenantEvent(TENANT, "kitchen-orders", "order-created", {});

    expect(removeChannel).toHaveBeenCalled();
  });

  it("nunca lança: pedido já gravado não vira 500 por causa do Realtime", async () => {
    send.mockRejectedValue(new Error("realtime fora"));
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      broadcastTenantEvent(TENANT, "kitchen-orders", "order-created", {})
    ).resolves.toBeUndefined();
    erro.mockRestore();
  });

  it("desiste depois de 2 segundos, em vez de segurar a resposta do pedido", async () => {
    vi.useFakeTimers();
    send.mockImplementation(() => new Promise(() => {})); // nunca responde
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});

    const envio = broadcastTenantEvent(TENANT, "kitchen-orders", "order-created", {});
    await vi.advanceTimersByTimeAsync(2100);

    await expect(envio).resolves.toBeUndefined();
    erro.mockRestore();
    vi.useRealTimers();
  });
});

describe("broadcastOrderUpdate", () => {
  it("publica para o pedido, para a cozinha e para o dono", async () => {
    await broadcastOrderUpdate(TENANT, pedido());

    expect(canaisUsados()).toEqual([
      topicoSeguro(TENANT, "order:order-1"),
      topicoSeguro(TENANT, "kitchen-orders"),
      topicoSeguro(TENANT, "user:cliente-1"),
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

    const idx = canaisUsados().indexOf(topicoSeguro(TENANT, "kitchen-orders"));
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
