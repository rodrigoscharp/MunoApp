// @vitest-environment jsdom
/**
 * A fila de corridas do motoboy.
 *
 * A tela é lida em movimento, com o capacete na mão, e decide duas coisas
 * práticas: quanto tempo o pedido está esperando e **se há dinheiro a cobrar na
 * porta**. Errar o segundo é o motoboy sair sem saber que precisa receber.
 *
 * A trava de uma corrida por vez também mora aqui: com entrega em andamento,
 * nenhum botão de aceitar pode responder.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a), info: (...a: unknown[]) => toastInfo(...a) },
}));

/** Handler do canal, para o teste simular um evento do restaurante. */
let aoReceber: ((m: { payload: Record<string, unknown> }) => void) | null = null;
vi.mock("@/lib/supabase", () => {
  const canal = {
    on: (_t: string, _e: unknown, cb: (m: { payload: Record<string, unknown> }) => void) => {
      aoReceber = cb;
      return canal;
    },
    subscribe: () => canal,
  };
  return { supabase: { channel: () => canal, removeChannel: vi.fn() } };
});

import { MotoboyOrdersList } from "./MotoboyOrdersList";

const fetchMock = vi.fn();

function corrida(over: Record<string, unknown> = {}) {
  return {
    id: "pedido-abc123",
    customerName: "Ana",
    deliveryAddress: "Rua A, 100",
    total: 50,
    createdAt: new Date(Date.now() - 5 * 60_000),
    paymentMethod: "PIX",
    paymentStatus: "PAID",
    items: [{ name: "X-Salada", quantity: 2 }],
    ...over,
  };
}

const montar = (
  disponiveis: Record<string, unknown>[] = [corrida()],
  ativa: Record<string, unknown> | null = null
) =>
  render(
    <MotoboyOrdersList
      availableOrders={disponiveis as never}
      activeDelivery={ativa as never}
      tenantId="restaurante-a"
    />
  );

beforeEach(() => {
  aoReceber = null;
  push.mockClear();
  refresh.mockClear();
  toastError.mockClear();
  toastSuccess.mockClear();
  toastInfo.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a fila", () => {
  it("avisa quando não há corrida", () => {
    montar([]);
    expect(screen.getByText(/nenhum pedido disponível/i)).toBeDefined();
  });

  it("mostra id curto, endereço e itens", () => {
    montar();

    expect(screen.getByText("#ABC123")).toBeDefined();
    expect(screen.getByText("Rua A, 100")).toBeDefined();
    expect(screen.getByText("2× X-Salada")).toBeDefined();
  });

  it("mostra há quanto tempo o pedido espera", () => {
    montar([corrida({ createdAt: new Date(Date.now() - 7 * 60_000) })]);
    expect(screen.getByText("7min esperando")).toBeDefined();
  });

  it("destaca em vermelho o pedido parado há mais de 15 minutos", () => {
    montar([corrida({ createdAt: new Date(Date.now() - 20 * 60_000) })]);
    expect(screen.getByText("20min esperando").className).toMatch(/text-red-400/);
  });

  it("não destaca o pedido recém-pronto", () => {
    montar([corrida({ createdAt: new Date(Date.now() - 2 * 60_000) })]);
    expect(screen.getByText("2min esperando").className).not.toMatch(/text-red-400/);
  });

  it("aguenta pedido sem endereço sem quebrar", () => {
    montar([corrida({ deliveryAddress: null })]);
    expect(screen.getByText("#ABC123")).toBeDefined();
  });
});

describe("o que cobrar na porta", () => {
  it("marca como já pago quando o pagamento entrou", () => {
    montar([corrida({ paymentStatus: "PAID" })]);

    expect(screen.getByText(/já pago/i)).toBeDefined();
    expect(screen.queryByText(/cobrar na entrega/i)).toBeNull();
  });

  it("diz quanto cobrar quando o pedido não está pago", () => {
    montar([corrida({ paymentStatus: "UNPAID", total: 50 })]);
    expect(screen.getByText(/cobrar na entrega: R\$ 50,00/i)).toBeDefined();
  });

  it.each([
    ["CASH", "Dinheiro"],
    ["CREDIT_CARD", "Cartão de crédito"],
    ["PIX", "PIX"],
  ])("nomeia a forma de pagamento %s", (paymentMethod, rotulo) => {
    montar([corrida({ paymentMethod })]);
    expect(screen.getByText(rotulo)).toBeDefined();
  });
});

describe("aceitar a corrida", () => {
  it("chama a rota de aceite do pedido certo", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: /aceitar/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/motoboy/orders/pedido-abc123/accept", {
        method: "POST",
      })
    );
  });

  it("leva para a tela de entrega quando dá certo", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: /aceitar/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/motoboy/delivery/pedido-abc123"));
  });

  it("mostra o motivo quando outro motoboy já pegou", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Pedido já foi aceito por outro motoboy" }),
    });
    montar();
    await userEvent.click(screen.getByRole("button", { name: /aceitar/i }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Pedido já foi aceito por outro motoboy")
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("libera o botão de novo depois de uma recusa", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "x" }) });
    montar();
    await userEvent.click(screen.getByRole("button", { name: /aceitar/i }));

    await waitFor(() =>
      expect((screen.getByRole("button", { name: /aceitar/i }) as HTMLButtonElement).disabled).toBe(false)
    );
  });

  it("avisa quando a rede cai", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    montar();
    await userEvent.click(screen.getByRole("button", { name: /aceitar/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Erro de conexão"));
  });
});

describe("uma corrida por vez", () => {
  const ativa = { id: "pedido-ativo", deliveryAddress: "Rua B, 2", customerName: "João", total: 30 };

  it("mostra a entrega em andamento", () => {
    montar([corrida()], ativa);

    expect(screen.getByText(/entrega em andamento/i)).toBeDefined();
    expect(screen.getByText(/João · Rua B, 2/)).toBeDefined();
  });

  it("bloqueia aceitar outra corrida enquanto há uma em andamento", () => {
    montar([corrida()], ativa);

    const aceitar = screen.getByRole("button", { name: /aceitar/i }) as HTMLButtonElement;
    expect(aceitar.disabled).toBe(true);
  });

  it("leva de volta para a entrega em andamento", async () => {
    montar([], ativa);
    await userEvent.click(screen.getByRole("button", { name: /continuar entrega/i }));

    expect(push).toHaveBeenCalledWith("/motoboy/delivery/pedido-ativo");
  });
});

describe("o aviso de pedido novo", () => {
  it("recarrega e avisa quando um delivery fica pronto", async () => {
    montar([]);
    aoReceber?.({ payload: { status: "READY", deliveryType: "DELIVERY" } });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toastInfo).toHaveBeenCalledWith(
      "Novo pedido disponível para entrega!",
      expect.anything()
    );
  });

  it("ignora pedido pronto que é de retirada", async () => {
    montar([]);
    aoReceber?.({ payload: { status: "READY", deliveryType: "PICKUP" } });

    expect(toastInfo).not.toHaveBeenCalled();
  });

  it("recarrega em silêncio quando outro motoboy aceita", async () => {
    montar([corrida()]);
    aoReceber?.({ payload: { status: "OUT_FOR_DELIVERY" } });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it("ignora mudança que não interessa à fila", () => {
    montar([corrida()]);
    aoReceber?.({ payload: { status: "IN_PREPARATION", deliveryType: "DELIVERY" } });

    expect(refresh).not.toHaveBeenCalled();
    expect(toastInfo).not.toHaveBeenCalled();
  });
});
