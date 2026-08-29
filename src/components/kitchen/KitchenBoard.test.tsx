// @vitest-environment jsdom
/**
 * O quadro da cozinha.
 *
 * Tudo aqui é otimista: o card muda de coluna antes de o servidor responder,
 * porque numa cozinha cheia esperar a rede é pior que corrigir depois. O que
 * sustenta isso é a **reversão** — e é ela que estes testes atacam, porque é o
 * caminho que ninguém exercita à mão.
 *
 * O hook roda de verdade: só o Supabase e o `fetch` são dublês. Testar o quadro
 * com o hook mockado esconderia justamente a costura entre os dois.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/supabase", () => {
  const canal = { on: () => canal, subscribe: () => canal };
  return { supabase: { channel: () => canal, removeChannel: vi.fn() } };
});

import { KitchenBoard } from "./KitchenBoard";

const fetchMock = vi.fn();

function pedido(over: Record<string, unknown> = {}) {
  return {
    id: "pedido-abc123",
    status: "IN_PREPARATION",
    deliveryType: "DELIVERY",
    total: 50,
    createdAt: new Date().toISOString(),
    customerName: "Ana",
    items: [
      { id: "oi-1", quantity: 2, notes: null, menuItem: { name: "X-Salada" } },
    ],
    ...over,
  };
}

/**
 * Servidor: GET devolve os pedidos; PATCH responde conforme `patchOk`.
 * `patches` guarda os corpos enviados.
 */
const patches: unknown[] = [];
let patchOk = true;

function servidorCom(pedidos: Record<string, unknown>[]) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      patches.push(JSON.parse(String(init.body)));
      return Promise.resolve({ ok: patchOk, json: async () => ({}) });
    }
    if (String(url).startsWith("/api/settings/printer")) {
      return Promise.resolve({ ok: true, json: async () => ({ enabled: false, paperWidth: "80mm" }) });
    }
    return Promise.resolve({ ok: true, json: async () => pedidos });
  });
}

async function montar(pedidos = [pedido()]) {
  servidorCom(pedidos);
  const r = render(<KitchenBoard tenantId="restaurante-a" />);
  await waitFor(() => expect(screen.queryByText(/carregando pedidos/i)).toBeNull());
  return r;
}

/** O card na tela, achado pelo id curto que o OrderCard imprime. */
const cartao = () => screen.queryByText("#ABC123");

beforeEach(() => {
  patches.length = 0;
  patchOk = true;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("o quadro", () => {
  it("mostra as cinco colunas do fluxo", async () => {
    await montar([]);

    for (const coluna of ["Pendente", "Confirmado", "Em Preparo", "Pronto", "Em Entrega"]) {
      expect(screen.getByText(coluna)).toBeDefined();
    }
  });

  it("mantém a coluna do pedido em rua, que só sai quando alguém fecha", async () => {
    await montar([pedido({ status: "OUT_FOR_DELIVERY" })]);
    expect(screen.getByText("Em Entrega")).toBeDefined();
    expect(cartao()).not.toBeNull();
  });

  it("diz quando a coluna está vazia", async () => {
    await montar([]);
    expect(screen.getAllByText("Nenhum pedido")).toHaveLength(5);
  });

  it("avisa quando o servidor falha, com opção de tentar de novo", async () => {
    fetchMock.mockImplementation((url: string) =>
      String(url).startsWith("/api/settings/printer")
        ? Promise.resolve({ ok: true, json: async () => ({ enabled: false, paperWidth: "80mm" }) })
        : Promise.resolve({ ok: false, json: async () => ({}) })
    );

    render(<KitchenBoard tenantId="restaurante-a" />);

    expect(await screen.findByText(/erro ao carregar pedidos/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeDefined();
  });
});

describe("avançar o pedido", () => {
  it("manda o próximo status do fluxo", async () => {
    await montar([pedido({ status: "IN_PREPARATION" })]);
    await userEvent.click(screen.getByRole("button", { name: /avançar/i }));

    await waitFor(() => expect(patches).toEqual([{ status: "READY" }]));
  });

  it("de PRONTO em delivery, sai para entrega — e não pula para entregue", async () => {
    // Este é o bug que o kitchen-flow existe para impedir: "Saiu p/ entrega"
    // gravava DELIVERED.
    await montar([pedido({ status: "READY", deliveryType: "DELIVERY" })]);
    await userEvent.click(screen.getByRole("button", { name: /saiu p\/ entrega/i }));

    await waitFor(() => expect(patches).toEqual([{ status: "OUT_FOR_DELIVERY" }]));
  });

  it("de PRONTO em retirada, o próximo passo é entregue", async () => {
    await montar([pedido({ status: "READY", deliveryType: "PICKUP" })]);
    await userEvent.click(screen.getByRole("button", { name: /retirado/i }));

    await waitFor(() => expect(patches).toEqual([{ status: "DELIVERED" }]));
  });

  it("de PRONTO na mesa, o botão fala a língua do salão", async () => {
    await montar([pedido({ status: "READY", deliveryType: "DINE_IN" })]);
    expect(screen.getByRole("button", { name: /servido/i })).toBeDefined();
  });

  it("tira o pedido do quadro quando ele termina", async () => {
    await montar([pedido({ status: "OUT_FOR_DELIVERY" })]);
    await userEvent.click(screen.getByRole("button", { name: /entregue/i }));

    await waitFor(() => expect(cartao()).toBeNull());
  });
});

describe("quando o servidor recusa a mudança", () => {
  beforeEach(() => {
    patchOk = false;
  });

  it("o pedido volta para a coluna de origem", async () => {
    await montar([pedido({ status: "IN_PREPARATION" })]);
    await userEvent.click(screen.getByRole("button", { name: /avançar/i }));

    // Continua no quadro, e no status de antes.
    await waitFor(() => expect(cartao()).not.toBeNull());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /avançar/i })).toBeDefined()
    );
  });

  it("o pedido que já tinha saído do quadro volta a aparecer", async () => {
    // A remoção otimista tira o card da lista; `updateOrderStatus` percorre a
    // lista com `map` e não encontra mais nada para reverter. Sem uma
    // ressincronia, o pedido some da cozinha enquanto o aviso diz que a
    // operação falhou.
    await montar([pedido({ status: "OUT_FOR_DELIVERY" })]);
    await userEvent.click(screen.getByRole("button", { name: /entregue/i }));

    await waitFor(() => expect(cartao()).not.toBeNull());
  });

  it("o pedido cancelado sem sucesso volta a aparecer", async () => {
    await montar([pedido({ status: "IN_PREPARATION" })]);
    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    await waitFor(() => expect(cartao()).not.toBeNull());
  });
});

describe("voltar uma fase", () => {
  it("manda o status anterior", async () => {
    await montar([pedido({ status: "IN_PREPARATION" })]);
    await userEvent.click(screen.getByRole("button", { name: /voltar/i }));

    await waitFor(() => expect(patches).toEqual([{ status: "CONFIRMED" }]));
  });

  it("não oferece voltar no primeiro status", async () => {
    await montar([pedido({ status: "PENDING" })]);
    expect(screen.queryByRole("button", { name: /voltar/i })).toBeNull();
  });
});

describe("cancelar", () => {
  it("manda CANCELLED e tira do quadro", async () => {
    await montar([pedido({ status: "IN_PREPARATION" })]);
    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    await waitFor(() => expect(patches).toEqual([{ status: "CANCELLED" }]));
    await waitFor(() => expect(cartao()).toBeNull());
  });

  it("não oferece cancelar um pedido já pronto", async () => {
    // Comida feita: cancelar aqui é prejuízo silencioso.
    await montar([pedido({ status: "READY" })]);
    expect(screen.queryByRole("button", { name: /cancelar/i })).toBeNull();
  });
});
