// @vitest-environment jsdom
/**
 * O histórico de pedidos do /adm.
 *
 * É a tela para onde o dono vai quando um cliente liga reclamando, então ela
 * precisa de duas coisas: achar o pedido (o filtro) e contar a verdade sobre o
 * que foi cobrado (o modal). O subtotal do modal é recomposto do total, como no
 * acompanhamento do cliente — as duas telas precisam dar o mesmo número, senão
 * o dono e o cliente discutem olhando contas diferentes.
 */

import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

/** Os tratadores do canal da cozinha, para o teste simular um aviso. */
const canal = vi.hoisted(() => ({ tratadores: {} as Record<string, (p: Record<string, unknown>) => void> }));
vi.mock("@/hooks/useTopicoRealtime", () => ({
  useCanalRealtime: (_c: string, _id: unknown, t: Record<string, (p: Record<string, unknown>) => void>) => {
    canal.tratadores = t;
    return "conectado";
  },
}));

import { AdminOrdersTable, ajusteDoEvento, estaAtrasado } from "./AdminOrdersTable";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

function pedido(over: Record<string, unknown> = {}) {
  return {
    id: "pedido-abc123",
    status: "PENDING",
    paymentMethod: "PIX",
    paymentStatus: "UNPAID",
    deliveryType: "DELIVERY",
    total: 50,
    notes: null,
    customerName: null,
    customerPhone: null,
    createdAt: "2026-08-29T12:00:00.000Z",
    updatedAt: "2026-08-29T12:00:00.000Z",
    items: [
      {
        id: "oi-1",
        quantity: 2,
        unitPrice: 25,
        notes: null,
        menuItem: { id: "item-1", name: "X-Salada", imageUrl: null },
      },
    ],
    user: { name: "Ana", email: "ana@exemplo.com" },
    table: null,
    ...over,
  };
}

const montar = (pedidos: Record<string, unknown>[] = [pedido()]) =>
  render(<AdminOrdersTable orders={pedidos as never} />);

/**
 * Abre o detalhe clicando no cartão e devolve o painel — escopo necessário
 * porque valores como o total aparecem também no cartão da lista.
 */
async function abrirDetalhe(idCurto = "#ABC123") {
  await userEvent.click(screen.getByText(idCurto));
  return detalhe();
}

const detalhe = () => screen.getByRole("complementary", { name: /detalhe do pedido/i });

/** O chip de filtro: o nome do status seguido da contagem. */
const filtro = (nome: string) =>
  screen.getByRole("button", { name: new RegExp(`^${nome}\\s*\\d+$`) });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  refresh.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ao vivo", () => {
  it("remenda o status da linha quando a cozinha avança o pedido", () => {
    montar([pedido()]);
    act(() => canal.tratadores["order-updated"]({ orderId: "pedido-abc123", status: "READY" }));

    const linha = screen.getByText("#ABC123").closest("button")!;
    expect(within(linha).getByText("Pronto")).toBeDefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("o detalhe aberto acompanha o pagamento que entra", async () => {
    montar([pedido()]);
    const modal = await abrirDetalhe();
    expect(within(modal).getByText("PIX pendente")).toBeDefined();

    act(() => canal.tratadores["order-updated"]({ id: "pedido-abc123", paymentStatus: "PAID" }));
    expect(within(detalhe()).getByText("Pago")).toBeDefined();
  });

  it("pedido novo recarrega a lista pelo servidor", async () => {
    montar([pedido()]);
    act(() => canal.tratadores["order-created"]({ orderId: "outro" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("ajusteDoEvento ignora o que não reconhece", () => {
    expect(ajusteDoEvento({ status: "READY" })).toBeNull();
    expect(ajusteDoEvento({ id: "a", status: "X", paymentStatus: "PAID" })).toEqual({
      id: "a",
      ajuste: { paymentStatus: "PAID" },
    });
  });
});

describe("a lista", () => {
  it("mostra o id curto, o cliente e o total", () => {
    montar();

    expect(screen.getByText("#ABC123")).toBeDefined();
    expect(screen.getByText("Ana")).toBeDefined();
    expect(screen.getByText("R$ 50,00")).toBeDefined();
  });

  it("avisa quando não há pedido nenhum", () => {
    montar([]);
    expect(screen.getByText(/nenhum pedido encontrado/i)).toBeDefined();
  });

  it("mostra travessão quando o pedido não tem cliente identificado", () => {
    montar([pedido({ user: null, customerName: null })]);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("mostra a mesa quando o pedido é do salão", () => {
    montar([pedido({ table: { number: 7, name: null } })]);
    expect(screen.getByText("Mesa 7")).toBeDefined();
  });

  it("prefere o nome da mesa ao número", () => {
    montar([pedido({ table: { number: 7, name: "Varanda" } })]);
    expect(screen.getByText("Varanda")).toBeDefined();
  });

  it("na mesa, o nome digitado vence o da conta", () => {
    // Quem está sentado pode não ser o dono do login.
    montar([
      pedido({ deliveryType: "DINE_IN", customerName: "João", user: { name: "Ana", email: "a@x" } }),
    ]);
    expect(screen.getByText("João")).toBeDefined();
  });

  it("no delivery, o nome da conta vence o digitado", () => {
    montar([
      pedido({ deliveryType: "DELIVERY", customerName: "João", user: { name: "Ana", email: "a@x" } }),
    ]);
    expect(screen.getByText("Ana")).toBeDefined();
  });
});

describe("o filtro por status", () => {
  const umDeCada = [
    pedido({ id: "p-pendente1", status: "PENDING" }),
    pedido({ id: "p-emrota1", status: "OUT_FOR_DELIVERY" }),
    pedido({ id: "p-entreg1", status: "DELIVERED" }),
  ];

  it("começa mostrando o que ainda está em andamento", () => {
    // A pergunta da hora do movimento é "o que falta sair?". O entregue
    // continua a um toque, no filtro dele e em Todos.
    montar(umDeCada);
    expect(screen.getAllByText(/^#/)).toHaveLength(2);
    expect(screen.queryByText("#NTREG1")).toBeNull();
  });

  it("conta os pedidos de cada status no próprio chip", () => {
    montar(umDeCada);
    expect(filtro("Em andamento").textContent).toContain("2");
    expect(filtro("Entregue").textContent).toContain("1");
    expect(filtro("Todos").textContent).toContain("3");
  });

  it("filtra pelo status escolhido", async () => {
    montar(umDeCada);
    await userEvent.click(filtro("Entregue"));

    expect(screen.getAllByText(/^#/)).toHaveLength(1);
    expect(screen.getByText("#NTREG1")).toBeDefined();
  });

  it("mostra todos ao escolher Todos", async () => {
    montar(umDeCada);
    await userEvent.click(filtro("Entregue"));
    await userEvent.click(filtro("Todos"));

    expect(screen.getAllByText(/^#/)).toHaveLength(3);
  });

  it("diz que não encontrou nada quando o filtro esvazia a lista", async () => {
    montar([pedido({ status: "PENDING" })]);
    await userEvent.click(filtro("Cancelado"));

    expect(screen.getByText(/nenhum pedido encontrado/i)).toBeDefined();
  });

  it("oferece filtro para todo status que a tabela sabe exibir", () => {
    // "Em Entrega" aparece na coluna de status mas não tinha botão de filtro:
    // o pedido em rua ficava inalcançável justamente na hora em que o cliente
    // liga perguntando dele.
    montar(umDeCada);

    for (const rotulo of [
      "Pendente",
      "Confirmado",
      "Em Preparo",
      "Pronto",
      "Em Entrega",
      "Entregue",
      "Cancelado",
    ]) {
      expect(filtro(rotulo), rotulo).toBeDefined();
    }
  });

  it("o filtro de Em Entrega encontra o pedido em rua", async () => {
    montar(umDeCada);
    await userEvent.click(filtro("Em Entrega"));

    expect(screen.getAllByText(/^#/)).toHaveLength(1);
    // "p-emrota1" → últimos seis, em maiúsculas.
    expect(screen.getByText("#MROTA1")).toBeDefined();
  });
});

describe("o detalhe do pedido", () => {
  it("abre ao clicar na linha", async () => {
    montar();
    await abrirDetalhe();

    expect(screen.getByRole("heading", { name: "Pedido #ABC123" })).toBeDefined();
  });

  it("fecha no X", async () => {
    montar();
    const modal = await abrirDetalhe();
    await userEvent.click(within(modal).getByRole("button", { name: "Fechar detalhe" }));

    expect(screen.queryByRole("heading", { name: /pedido #/i })).toBeNull();
  });

  it("lista os itens com quantidade e subtotal", async () => {
    montar();
    const modal = await abrirDetalhe();

    expect(within(modal).getByText("2x")).toBeDefined();
    expect(within(modal).getByText("X-Salada")).toBeDefined();
  });

  it("mostra a observação do pedido em destaque", async () => {
    montar([pedido({ notes: "tocar a campainha" })]);
    const modal = await abrirDetalhe();

    expect(within(modal).getByText("tocar a campainha")).toBeDefined();
  });

  it("mostra o contato do cliente", async () => {
    montar([pedido({ customerPhone: "11999998888" })]);
    const modal = await abrirDetalhe();

    expect(within(modal).getByText("ana@exemplo.com")).toBeDefined();
    expect(within(modal).getByText("11999998888")).toBeDefined();
  });
});

describe("a conta no detalhe", () => {
  it("esconde o bloco num pedido sem frete nem desconto", async () => {
    montar([pedido({ total: 50, deliveryFee: 0, discount: 0 })]);
    const modal = await abrirDetalhe();

    expect(within(modal).queryByText("Subtotal")).toBeNull();
    expect(within(modal).getByText("Total")).toBeDefined();
  });

  it("recompõe o subtotal com frete e desconto", async () => {
    // itens 50 + frete 8 − desconto 10 = total 48.
    montar([pedido({ total: 48, deliveryFee: 8, discount: 10, couponCode: "PROMO10" })]);
    const modal = await abrirDetalhe();

    expect(within(modal).getByText("Subtotal")).toBeDefined();
    expect(within(modal).getAllByText("R$ 50,00").length).toBeGreaterThan(0);
    expect(within(modal).getByText("R$ 8,00")).toBeDefined();
    expect(within(modal).getByText("-R$ 10,00")).toBeDefined();
    expect(within(modal).getByText("R$ 48,00")).toBeDefined();
    expect(within(modal).getByText(/PROMO10/)).toBeDefined();
  });

  it("dá o mesmo subtotal que a tela do cliente daria", async () => {
    // A fórmula é a mesma nos dois lados: total − frete + desconto.
    montar([pedido({ total: 58, deliveryFee: 8, discount: 0 })]);
    const modal = await abrirDetalhe();

    expect(within(modal).getAllByText("R$ 50,00").length).toBeGreaterThan(0);
  });
});

describe("o topo", () => {
  it("mostra os pedidos e a receita de hoje contados no servidor", () => {
    render(<AdminOrdersTable orders={[pedido()] as never} hoje={{ pedidos: 31, receita: 1133 }} />);
    expect(screen.getByText(/Hoje · 31 pedidos · R\$\s?1\.133,00/)).toBeDefined();
  });
});

describe("a busca", () => {
  const varios = [
    pedido({ id: "p-aaaaa1", user: null, customerName: "Joana Araújo", customerPhone: "(11) 98888-7777" }),
    pedido({ id: "p-bbbbb2", user: { name: "Carlos", email: "c@x" }, customerPhone: "21955554444" }),
  ];

  it("acha pelo número curto, com ou sem #", async () => {
    montar(varios);
    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar pedido" }), "#bbbbb2");
    expect(screen.getAllByText(/^#/)).toHaveLength(1);
    expect(screen.getByText("#BBBBB2")).toBeDefined();
  });

  it("acha pelo nome sem depender de acento", async () => {
    montar(varios);
    await userEvent.type(screen.getByRole("searchbox"), "araujo");
    expect(screen.getByText("#AAAAA1")).toBeDefined();
    expect(screen.queryByText("#BBBBB2")).toBeNull();
  });

  it("acha pelo telefone comparando só os dígitos", async () => {
    montar(varios);
    await userEvent.type(screen.getByRole("searchbox"), "98888 7777");
    expect(screen.getByText("#AAAAA1")).toBeDefined();
    expect(screen.queryByText("#BBBBB2")).toBeNull();
  });
});

describe("o atraso", () => {
  const agora = new Date("2026-08-29T13:00:00.000Z").getTime();

  it("é a previsão prometida ao cliente que passou", () => {
    expect(
      estaAtrasado(
        { status: "IN_PREPARATION", createdAt: "2026-08-29T12:00:00.000Z", estimatedDeliveryAt: "2026-08-29T12:45:00.000Z" },
        agora
      )
    ).toBe(true);
    expect(
      estaAtrasado(
        { status: "IN_PREPARATION", createdAt: "2026-08-29T12:30:00.000Z", estimatedDeliveryAt: "2026-08-29T13:15:00.000Z" },
        agora
      )
    ).toBe(false);
  });

  it("sem previsão gravada, usa os 45 minutos padrão", () => {
    expect(estaAtrasado({ status: "PENDING", createdAt: "2026-08-29T12:10:00.000Z" }, agora)).toBe(true);
    expect(estaAtrasado({ status: "PENDING", createdAt: "2026-08-29T12:20:00.000Z" }, agora)).toBe(false);
  });

  it("pedido encerrado nunca está atrasado", () => {
    expect(estaAtrasado({ status: "DELIVERED", createdAt: "2026-08-29T08:00:00.000Z" }, agora)).toBe(false);
    expect(estaAtrasado({ status: "CANCELLED", createdAt: "2026-08-29T08:00:00.000Z" }, agora)).toBe(false);
  });

  it("o cartão do pedido atrasado diz isso em texto, não só na cor", () => {
    montar([
      pedido({ status: "CONFIRMED", createdAt: "2020-01-01T12:00:00.000Z", estimatedDeliveryAt: "2020-01-01T12:45:00.000Z" }),
    ]);
    const cartao = screen.getByText("#ABC123").closest("button")!;
    expect(within(cartao).getByText("Atrasado")).toBeDefined();
  });
});

describe("as ações do detalhe", () => {
  const patches = () =>
    fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "PATCH");
  const corpo = (i = 0) => JSON.parse((patches()[i][1] as RequestInit).body as string);

  it("o botão principal grava o próximo passo do fluxo da cozinha", async () => {
    montar([pedido({ status: "IN_PREPARATION" })]);
    const modal = await abrirDetalhe();
    await userEvent.click(within(modal).getByRole("button", { name: "Marcar como pronto" }));

    expect(patches()).toHaveLength(1);
    expect(patches()[0][0]).toBe("/api/orders/pedido-abc123");
    expect(corpo()).toEqual({ status: "READY" });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const cartao = screen.getByText("#ABC123").closest("button")!;
    expect(within(cartao).getByText("Pronto")).toBeDefined();
  });

  it("delivery pronto sai para a rua, não vira entregue", async () => {
    montar([pedido({ status: "READY", deliveryType: "DELIVERY" })]);
    const modal = await abrirDetalhe();
    await userEvent.click(within(modal).getByRole("button", { name: "Saiu para entrega" }));
    expect(corpo()).toEqual({ status: "OUT_FOR_DELIVERY" });
  });

  it("recusa do servidor devolve o status de antes e recarrega a lista", async () => {
    fetchMock.mockImplementation(async (_u: string, init?: RequestInit) =>
      init?.method === "PATCH" ? new Response("{}", { status: 409 }) : new Response("{}")
    );
    montar([pedido({ status: "PENDING" })]);
    const modal = await abrirDetalhe();
    await userEvent.click(within(modal).getByRole("button", { name: "Aceitar pedido" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const cartao = screen.getByText("#ABC123").closest("button")!;
    expect(within(cartao).getByText("Pendente")).toBeDefined();
    expect(refresh).toHaveBeenCalled();
  });

  it("cancelar pede confirmação no próprio painel antes de gravar", async () => {
    montar([pedido({ status: "CONFIRMED" })]);
    const modal = await abrirDetalhe();
    await userEvent.click(within(modal).getByRole("button", { name: "Cancelar pedido" }));
    expect(patches()).toHaveLength(0);

    await userEvent.click(within(modal).getByRole("button", { name: "Manter pedido" }));
    expect(patches()).toHaveLength(0);

    await userEvent.click(within(modal).getByRole("button", { name: "Cancelar pedido" }));
    await userEvent.click(within(modal).getByRole("button", { name: "Sim, cancelar" }));
    expect(corpo()).toEqual({ status: "CANCELLED" });
  });

  it("avisa do estorno ao cancelar pedido pago online", async () => {
    montar([pedido({ status: "CONFIRMED", paymentStatus: "PAID", paymentMethod: "PIX" })]);
    const modal = await abrirDetalhe();
    await userEvent.click(within(modal).getByRole("button", { name: "Cancelar pedido" }));
    expect(within(modal).getByText(/estorno/)).toBeDefined();
  });

  it("pedido encerrado não oferece avançar nem cancelar, só imprimir", async () => {
    montar([pedido({ status: "DELIVERED" })]);
    await userEvent.click(filtro("Todos"));
    const modal = await abrirDetalhe();
    expect(within(modal).queryByRole("button", { name: "Cancelar pedido" })).toBeNull();
    expect(within(modal).getByRole("button", { name: /imprimir/i })).toBeDefined();
  });

  it("o atalho para o chat só aparece em pedido com conversa", async () => {
    render(<AdminOrdersTable orders={[pedido()] as never} comConversa={["pedido-abc123"]} />);
    const modal = await abrirDetalhe();
    expect(within(modal).getByRole("link", { name: /abrir conversa/i }).getAttribute("href")).toBe(
      "/adm/chats?pedido=pedido-abc123"
    );
  });

  it("sem conversa, não há atalho para o chat", async () => {
    montar();
    const modal = await abrirDetalhe();
    expect(within(modal).queryByRole("link", { name: /abrir conversa/i })).toBeNull();
  });

  it("mostra quantos pedidos o cliente já fez", async () => {
    render(<AdminOrdersTable orders={[pedido({ userId: "u1" })] as never} pedidosPorCliente={{ u1: 7 }} />);
    const modal = await abrirDetalhe();
    expect(within(modal).getByText(/7 pedidos/)).toBeDefined();
  });
});
