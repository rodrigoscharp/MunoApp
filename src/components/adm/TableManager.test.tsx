// @vitest-environment jsdom
/**
 * O salão: mesas, QR, comanda e fechamento de conta.
 *
 * O fechamento é a única tela do /adm que marca pedido como pago sem passar por
 * gateway — a conferência é humana, no balcão. Por isso os testes se concentram
 * em três números: o subtotal da mesa, os 10% de serviço, e a soma das formas de
 * pagamento contra o que falta. E, depois de fechar, no que o garçom vê na lista.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) },
}));

vi.mock("qrcode.react", () => ({ QRCodeSVG: () => <svg data-testid="qr" /> }));
vi.mock("./TableMapView", () => ({ TableMapView: () => <div data-testid="mapa-salao" /> }));

import { TableManager } from "./TableManager";

const fetchMock = vi.fn();

function mesa(over: Record<string, unknown> = {}) {
  return {
    id: "mesa-1",
    number: 7,
    name: "Varanda",
    token: "tok-1",
    active: true,
    openOrdersCount: 0,
    openTotal: 0,
    posX: null,
    posY: null,
    ...over,
  };
}

function pedidoDaMesa(over: Record<string, unknown> = {}) {
  return {
    id: "pedido-1",
    status: "DELIVERED",
    paymentStatus: "UNPAID",
    total: 100,
    customerName: "Ana",
    createdAt: new Date().toISOString(),
    items: [{ id: "oi-1", quantity: 2, unitPrice: 50, menuItem: { name: "X-Salada" } }],
    ...over,
  };
}

/** Estado do servidor, mutável durante o teste. */
let mesas: Record<string, unknown>[] = [];
let pedidos: Record<string, unknown>[] = [];
let postMesaOk = true;
let fecharOk = true;
const corposEnviados: { url: string; body: unknown }[] = [];

function servidor() {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    const metodo = init?.method ?? "GET";

    if (u.startsWith("/api/settings/printer")) {
      return Promise.resolve({ ok: true, json: async () => ({ enabled: false, paperWidth: "80mm" }) });
    }
    if (u === "/api/tables" && metodo === "POST") {
      corposEnviados.push({ url: u, body: JSON.parse(String(init!.body)) });
      return Promise.resolve(
        postMesaOk
          ? { ok: true, json: async () => mesa({ id: "mesa-nova" }) }
          : { ok: false, json: async () => ({ error: "Já existe uma mesa com esse número" }) }
      );
    }
    if (u === "/api/tables") {
      return Promise.resolve({ ok: true, json: async () => mesas });
    }
    if (u.includes("/close-bill")) {
      corposEnviados.push({ url: u, body: JSON.parse(String(init!.body)) });
      return Promise.resolve(
        fecharOk
          ? { ok: true, json: async () => ({ ok: true, count: 1 }) }
          : { ok: false, json: async () => ({ error: "Soma menor que o total em aberto" }) }
      );
    }
    if (u.includes("/orders")) {
      return Promise.resolve({ ok: true, json: async () => pedidos });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

async function montar() {
  servidor();
  const r = render(<TableManager />);
  await waitFor(() => expect(screen.queryByText(/carregando/i)).toBeNull());
  return r;
}

/** O card do modal aberto — o botão "Fechar conta" existe também no card da mesa. */
const modal = () => document.querySelector<HTMLElement>(".max-w-lg")!;

/** Abre o fechamento de conta da mesa e espera os pedidos chegarem. */
async function abrirFechamento() {
  // O botão do card da mesa; dentro do modal há outro com o mesmo nome.
  await userEvent.click(screen.getAllByRole("button", { name: /fechar conta/i })[0]);
  await screen.findAllByText(/X-Salada/);
}

/** Avança da conferência para a etapa de pagamento. */
async function irParaPagamento() {
  await userEvent.click(within(modal()).getByRole("button", { name: /fechar conta/i }));
}

/** Confirma o fechamento na etapa de pagamento. */
async function confirmar() {
  await userEvent.click(within(modal()).getByRole("button", { name: /confirmar e fechar/i }));
}

beforeEach(() => {
  mesas = [mesa()];
  pedidos = [pedidoDaMesa()];
  postMesaOk = true;
  fecharOk = true;
  corposEnviados.length = 0;
  toastError.mockClear();
  toastSuccess.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a lista de mesas", () => {
  it("mostra a mesa pelo nome", async () => {
    await montar();
    expect(screen.getByText("Mesa 7 · Varanda")).toBeDefined();
  });

  it("mostra o que a mesa tem em aberto", async () => {
    mesas = [mesa({ openOrdersCount: 2, openTotal: 100 })];
    await montar();

    expect(screen.getByText(/2 pedidos em aberto/i)).toBeDefined();
    expect(screen.getByText("R$ 100,00")).toBeDefined();
  });

  it("concorda no singular quando há um pedido só", async () => {
    mesas = [mesa({ openOrdersCount: 1, openTotal: 50 })];
    await montar();

    expect(screen.getByText(/1 pedido em aberto/i)).toBeDefined();
  });
});

describe("criar mesa", () => {
  it("manda número e nome", async () => {
    await montar();
    await userEvent.click(screen.getByRole("button", { name: /nova mesa/i }));
    await userEvent.type(screen.getByPlaceholderText("Ex: 1"), "12");
    await userEvent.type(screen.getByPlaceholderText("Ex: Varanda"), "Fundo");
    await userEvent.click(screen.getByRole("button", { name: /criar mesa/i }));

    await waitFor(() =>
      expect(corposEnviados.find((c) => c.url === "/api/tables")?.body).toEqual({
        number: 12,
        name: "Fundo",
      })
    );
  });

  it("não manda número inválido", async () => {
    await montar();
    await userEvent.click(screen.getByRole("button", { name: /nova mesa/i }));
    await userEvent.type(screen.getByPlaceholderText("Ex: 1"), "0");
    await userEvent.click(screen.getByRole("button", { name: /criar mesa/i }));

    expect(corposEnviados.find((c) => c.url === "/api/tables")).toBeUndefined();
  });

  it("diz por que o cadastro falhou, em vez de não fazer nada", async () => {
    // O servidor responde 409 com "Já existe uma mesa com esse número". Sem
    // mostrar, o admin clica em Salvar, nada acontece, e ele não tem como saber
    // que o número já está em uso.
    postMesaOk = false;
    await montar();
    await userEvent.click(screen.getByRole("button", { name: /nova mesa/i }));
    await userEvent.type(screen.getByPlaceholderText("Ex: 1"), "7");
    await userEvent.click(screen.getByRole("button", { name: /criar mesa/i }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Já existe uma mesa com esse número")
    );
  });
});

describe("excluir mesa", () => {
  it("pede confirmação antes", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    await montar();
    await userEvent.click(screen.getByRole("button", { name: /excluir mesa/i }));

    expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit)?.method === "DELETE")).toBe(false);
  });

  it("exclui quando confirmado", async () => {
    await montar();
    await userEvent.click(screen.getByRole("button", { name: /excluir mesa/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/tables/mesa-1", { method: "DELETE" })
    );
  });
});

describe("a conta da mesa", () => {
  it("agrupa os itens por pessoa", async () => {
    pedidos = [
      pedidoDaMesa({ id: "p1", customerName: "Ana", total: 100 }),
      pedidoDaMesa({ id: "p2", customerName: "João", total: 40 }),
    ];
    await montar();
    await abrirFechamento();

    expect(screen.getByText("Ana")).toBeDefined();
    expect(screen.getByText("João")).toBeDefined();
  });

  it("chama de Cliente quem não deu nome", async () => {
    pedidos = [pedidoDaMesa({ customerName: null })];
    await montar();
    await abrirFechamento();

    expect(screen.getByText("Cliente")).toBeDefined();
  });

  it("soma o total da mesa", async () => {
    pedidos = [pedidoDaMesa({ id: "p1", total: 100 }), pedidoDaMesa({ id: "p2", total: 40 })];
    await montar();
    await abrirFechamento();

    expect(screen.getAllByText("R$ 140,00").length).toBeGreaterThan(0);
  });

  it("acrescenta 10% de serviço quando o garçom marca", async () => {
    pedidos = [pedidoDaMesa({ total: 100 })];
    await montar();
    await abrirFechamento();

    await userEvent.click(screen.getByRole("switch"));

    expect(screen.getAllByText("R$ 110,00").length).toBeGreaterThan(0);
  });

  it("tira o serviço ao desmarcar", async () => {
    pedidos = [pedidoDaMesa({ total: 100 })];
    await montar();
    await abrirFechamento();

    const caixa = screen.getByRole("switch");
    await userEvent.click(caixa);
    await userEvent.click(caixa);

    expect(screen.getAllByText("R$ 100,00").length).toBeGreaterThan(0);
  });
});

describe("as formas de pagamento", () => {
  beforeEach(() => {
    pedidos = [pedidoDaMesa({ total: 100 })];
  });

  it("já vem preenchida com o total em dinheiro", async () => {
    await montar();
    await abrirFechamento();
    await irParaPagamento();

    expect((screen.getByDisplayValue("100.00") as HTMLInputElement)).toBeDefined();
  });

  it("manda as linhas de pagamento ao fechar", async () => {
    await montar();
    await abrirFechamento();
    await irParaPagamento();
    await confirmar();

    await waitFor(() => {
      const envio = corposEnviados.find((c) => c.url.includes("/close-bill"));
      expect(envio?.body).toEqual({ payments: [{ method: "CASH", amount: 100 }] });
    });
  });

  it("trava o fechamento enquanto a soma não bate com a conta", async () => {
    // Dez centavos a menos numa conta de R$ 100: o botão não pode responder,
    // senão a mesa é marcada como paga por um valor que não foi recebido.
    await montar();
    await abrirFechamento();
    await irParaPagamento();

    const campo = screen.getByDisplayValue("100.00");
    await userEvent.clear(campo);
    await userEvent.type(campo, "99.90");

    const botao = within(modal()).getByRole("button", { name: /confirmar e fechar/i });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
  });

  it("aceita a conta dividida em duas formas que somam o total", async () => {
    await montar();
    await abrirFechamento();
    await irParaPagamento();

    const primeiro = screen.getByDisplayValue("100.00");
    await userEvent.clear(primeiro);
    await userEvent.type(primeiro, "60");

    await userEvent.click(within(modal()).getByRole("button", { name: /adicionar forma/i }));
    const campos = within(modal()).getAllByRole("spinbutton");
    await userEvent.type(campos[1], "40");

    await confirmar();

    await waitFor(() => {
      const envio = corposEnviados.find((c) => c.url.includes("/close-bill"));
      expect((envio?.body as { payments: { amount: number }[] }).payments).toEqual([
        { method: "CASH", amount: 60 },
        { method: "CASH", amount: 40 },
      ]);
    });
  });

  it("mostra o motivo quando o servidor recusa o fechamento", async () => {
    fecharOk = false;
    await montar();
    await abrirFechamento();
    await irParaPagamento();
    await confirmar();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Soma menor que o total em aberto")
    );
  });
});

describe("depois de fechar a conta", () => {
  beforeEach(() => {
    mesas = [mesa({ openOrdersCount: 1, openTotal: 100 })];
    pedidos = [pedidoDaMesa({ total: 100 })];
  });

  it("confirma que fechou", async () => {
    await montar();
    await abrirFechamento();
    await irParaPagamento();
    await confirmar();

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Conta fechada"));
  });

  it("a mesa deixa de aparecer como ocupada na lista", async () => {
    // Sem recarregar, o card continua anunciando "1 pedido em aberto · R$ 100,00"
    // depois de a conta ter sido fechada, e o garçom acha que não deu certo.
    await montar();
    await abrirFechamento();
    await irParaPagamento();

    // O servidor passa a devolver a mesa já livre.
    mesas = [mesa({ openOrdersCount: 0, openTotal: 0 })];
    await confirmar();

    // O contador do topo também diz "em aberto"; o que interessa é o aviso do card.
    await waitFor(() => expect(screen.queryByText(/pedido.? em aberto/i)).toBeNull());
  });
});
