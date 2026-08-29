// @vitest-environment jsdom
/**
 * A tela de entrega em andamento.
 *
 * É a única do app que roda com o celular no bolso e a moto andando, e o que ela
 * faz de mais delicado não aparece na tela: enviar a posição do motoboy para o
 * cliente acompanhar. O envio tem um filtro de distância — sem ele, o
 * `watchPosition` dispara a cada tremida do GPS parado no semáforo e vira uma
 * requisição por segundo, por entrega.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) },
}));

// O mapa é carregado por `dynamic` e depende de leaflet; aqui só interessa
// *quando* ele entra no lugar do "aguardando sinal".
vi.mock("next/dynamic", () => ({
  default: () => function MapaDublê() {
    return <div data-testid="mapa" />;
  },
}));

import { MotoboyDeliveryClient } from "./MotoboyDeliveryClient";

const ORDER_ID = "pedido-abc123";
const fetchMock = vi.fn();

/** Controle do GPS: guarda os callbacks para o teste emitir posições. */
let aoMover: ((pos: { coords: { latitude: number; longitude: number } }) => void) | null = null;
let aoFalhar: ((err: { code: number }) => void) | null = null;
const clearWatch = vi.fn();

function comGps() {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: (ok: typeof aoMover, erro: typeof aoFalhar) => {
        aoMover = ok;
        aoFalhar = erro;
        return 42;
      },
      clearWatch,
    },
  });
}

function semGps() {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
}

const montar = (props: Record<string, unknown> = {}) =>
  render(
    <MotoboyDeliveryClient
      orderId={ORDER_ID}
      deliveryAddress="Rua A, 100"
      customerName="Ana"
      customerPhone="11999998888"
      total={50}
      items={[{ name: "X-Salada", quantity: 2 }]}
      initialLat={null}
      initialLng={null}
      {...props}
    />
  );

/** Posições enviadas para a rota de localização. */
const posicoesEnviadas = () =>
  fetchMock.mock.calls
    .filter(([url]) => String(url).includes("/location"))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

beforeEach(() => {
  aoMover = null;
  aoFalhar = null;
  clearWatch.mockClear();
  push.mockClear();
  refresh.mockClear();
  toastError.mockClear();
  toastSuccess.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
  comGps();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("o que o motoboy vê na porta", () => {
  it("mostra endereço, cliente e id curto", () => {
    montar();

    expect(screen.getByText("Rua A, 100")).toBeDefined();
    expect(screen.getByText("Ana")).toBeDefined();
    expect(screen.getByText("#ABC123")).toBeDefined();
  });

  it("oferece o telefone como link de ligação", () => {
    montar();
    const link = screen.getByRole("link", { name: /11999998888/ });
    expect(link.getAttribute("href")).toBe("tel:11999998888");
  });

  it("não mostra link de telefone quando o pedido não tem um", () => {
    montar({ customerPhone: null });
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("lista os itens e o total", () => {
    montar();

    expect(screen.getByText("2× X-Salada")).toBeDefined();
    expect(screen.getByText("R$ 50,00")).toBeDefined();
  });
});

describe("o sinal de GPS", () => {
  it("espera o sinal antes de montar o mapa", () => {
    montar();

    expect(screen.getByText(/aguardando sinal gps/i)).toBeDefined();
    expect(screen.queryByTestId("mapa")).toBeNull();
  });

  it("mostra o mapa quando já veio posição do servidor", () => {
    montar({ initialLat: -23.5, initialLng: -46.6 });
    expect(screen.getByTestId("mapa")).toBeDefined();
  });

  it("troca para o mapa quando o GPS responde", async () => {
    montar();
    aoMover?.({ coords: { latitude: -23.5, longitude: -46.6 } });

    await waitFor(() => expect(screen.getByTestId("mapa")).toBeDefined());
  });

  it("avisa quando o aparelho não tem GPS", () => {
    semGps();
    montar();

    expect(screen.getByText(/gps não disponível/i)).toBeDefined();
  });

  it("explica a permissão negada, que é o erro que o motoboy pode resolver", async () => {
    montar();
    aoFalhar?.({ code: 1 });

    await waitFor(() => expect(screen.getByText(/permissão de localização negada/i)).toBeDefined());
  });

  it("mostra erro genérico para as outras falhas de GPS", async () => {
    montar();
    aoFalhar?.({ code: 2 });

    await waitFor(() => expect(screen.getByText(/erro ao obter localização/i)).toBeDefined());
  });

  it("limpa o erro quando o sinal volta", async () => {
    montar();
    aoFalhar?.({ code: 2 });
    await waitFor(() => expect(screen.getByText(/erro ao obter localização/i)).toBeDefined());

    aoMover?.({ coords: { latitude: -23.5, longitude: -46.6 } });

    await waitFor(() => expect(screen.queryByText(/erro ao obter localização/i)).toBeNull());
  });

  it("desliga o rastreamento ao sair da tela", () => {
    const { unmount } = montar();
    unmount();

    expect(clearWatch).toHaveBeenCalledWith(42);
  });
});

describe("o envio da posição", () => {
  it("manda a primeira posição recebida", async () => {
    montar();
    aoMover?.({ coords: { latitude: -23.5, longitude: -46.6 } });

    await waitFor(() => expect(posicoesEnviadas()).toEqual([{ lat: -23.5, lng: -46.6 }]));
  });

  it("manda para a rota do pedido em curso", async () => {
    montar();
    aoMover?.({ coords: { latitude: -23.5, longitude: -46.6 } });

    await waitFor(() =>
      expect(fetchMock.mock.calls[0][0]).toBe(`/api/motoboy/orders/${ORDER_ID}/location`)
    );
  });

  it("engole tremida de GPS parado no semáforo", async () => {
    // ~1m de diferença: não vale uma requisição.
    montar();
    aoMover?.({ coords: { latitude: -23.5, longitude: -46.6 } });
    await waitFor(() => expect(posicoesEnviadas()).toHaveLength(1));

    aoMover?.({ coords: { latitude: -23.50001, longitude: -46.60001 } });

    await new Promise((r) => setTimeout(r, 0));
    expect(posicoesEnviadas()).toHaveLength(1);
  });

  it("manda de novo quando o motoboy realmente andou", async () => {
    montar();
    aoMover?.({ coords: { latitude: -23.5, longitude: -46.6 } });
    await waitFor(() => expect(posicoesEnviadas()).toHaveLength(1));

    aoMover?.({ coords: { latitude: -23.51, longitude: -46.61 } });

    await waitFor(() => expect(posicoesEnviadas()).toHaveLength(2));
  });

  it("segue rastreando mesmo se o envio falhar", async () => {
    // Perder uma posição é aceitável; parar de rastrear não.
    fetchMock.mockRejectedValue(new Error("offline"));
    montar();
    aoMover?.({ coords: { latitude: -23.5, longitude: -46.6 } });

    await waitFor(() => expect(screen.getByTestId("mapa")).toBeDefined());
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe("confirmar a entrega", () => {
  it("chama a rota de conclusão", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: /confirmar entrega/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(`/api/motoboy/orders/${ORDER_ID}/complete`, {
        method: "POST",
      })
    );
  });

  it("volta para a fila depois de concluir", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: /confirmar entrega/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/motoboy/pedidos"));
    expect(toastSuccess).toHaveBeenCalledWith("Entrega concluída!");
  });

  it("não sai da tela quando o servidor recusa", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    montar();
    await userEvent.click(screen.getByRole("button", { name: /confirmar entrega/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Erro ao confirmar entrega"));
    expect(push).not.toHaveBeenCalled();
  });

  it("libera o botão de novo depois de uma recusa", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    montar();
    await userEvent.click(screen.getByRole("button", { name: /confirmar entrega/i }));

    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /confirmar entrega/i }) as HTMLButtonElement).disabled
      ).toBe(false)
    );
  });

  it("avisa quando a rede cai", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    montar();
    await userEvent.click(screen.getByRole("button", { name: /confirmar entrega/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Erro de conexão"));
  });
});
