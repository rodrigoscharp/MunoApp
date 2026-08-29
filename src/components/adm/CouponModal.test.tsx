// @vitest-environment jsdom
/**
 * O cadastro de cupom.
 *
 * Duas coisas justificam o teste. A primeira é a validação por tipo: um cupom de
 * porcentagem com 150 e um de valor fixo com 0 são erros que só a tela pega — a
 * rota aceita qualquer número.
 *
 * A segunda é a data, e é a mais sutil. O `<input type="date">` fala
 * "AAAA-MM-DD" sem fuso; interpretar isso como UTC adiantaria a virada em três
 * horas no Brasil, e um cupom "válido até 31/08" morreria às 21h do dia 30. A
 * ida ancora no começo e no fim do dia local, e a volta reformata no fuso local.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) },
}));

import { CouponModal } from "./CouponModal";

const fetchMock = vi.fn();
const onSaved = vi.fn();
const onClose = vi.fn();

let respostaOk = true;
let corpoDeErro: unknown = {};

function servidor() {
  fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
    Promise.resolve(
      respostaOk
        ? { ok: true, json: async () => ({ id: "cupom-1", ...JSON.parse(String(init!.body)) }) }
        : { ok: false, json: async () => corpoDeErro }
    )
  );
}

const montar = (coupon: Record<string, unknown> | null = null) =>
  render(
    <CouponModal open onClose={onClose} coupon={coupon as never} onSaved={onSaved} />
  );

const campo = {
  codigo: () => screen.getByPlaceholderText("PRIMEIRACOMPRA"),
  tipo: () => screen.getByRole("combobox"),
  validoDe: () => document.querySelector<HTMLInputElement>('input[name="validFrom"]')!,
  validoAte: () => document.querySelector<HTMLInputElement>('input[name="validUntil"]')!,
};

const salvar = () => userEvent.click(screen.getByRole("button", { name: /salvar|criar/i }));

/** O corpo enviado ao servidor na última chamada. */
const enviado = () => JSON.parse(String((fetchMock.mock.calls.at(-1)![1] as RequestInit).body));

async function preencherValido() {
  await userEvent.type(campo.codigo(), "PROMO10");
  await userEvent.type(screen.getByPlaceholderText("10"), "10");
}

beforeEach(() => {
  respostaOk = true;
  corpoDeErro = {};
  fetchMock.mockReset();
  onSaved.mockClear();
  onClose.mockClear();
  toastError.mockClear();
  toastSuccess.mockClear();
  servidor();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("validação", () => {
  it("recusa código curto demais", async () => {
    montar();
    await userEvent.type(campo.codigo(), "AB");
    await salvar();

    expect(await screen.findByText(/pelo menos 3 caracteres/i)).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa porcentagem acima de 100", async () => {
    montar();
    await userEvent.type(campo.codigo(), "PROMO");
    await userEvent.type(screen.getByPlaceholderText("10"), "150");
    await salvar();

    expect(await screen.findByText(/entre 1 e 100/i)).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa porcentagem zerada", async () => {
    montar();
    await userEvent.type(campo.codigo(), "PROMO");
    await userEvent.type(screen.getByPlaceholderText("10"), "0");
    await salvar();

    expect(await screen.findByText(/entre 1 e 100/i)).toBeDefined();
  });

  it("recusa valor fixo zerado", async () => {
    montar();
    await userEvent.selectOptions(campo.tipo(), "FIXED");
    await userEvent.type(campo.codigo(), "PROMO");
    await userEvent.type(screen.getByPlaceholderText("15,00"), "0");
    await salvar();

    expect(await screen.findByText(/informe o valor do desconto/i)).toBeDefined();
  });

  it("recusa data final antes da inicial", async () => {
    montar();
    await preencherValido();
    await userEvent.type(campo.validoDe(), "2026-09-10");
    await userEvent.type(campo.validoAte(), "2026-09-01");
    await salvar();

    expect(await screen.findByText(/não pode ser antes da inicial/i)).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("frete grátis", () => {
  it("esconde o campo de valor", async () => {
    montar();
    await userEvent.selectOptions(campo.tipo(), "FREE_SHIPPING");

    expect(screen.queryByPlaceholderText("10")).toBeNull();
    expect(screen.queryByPlaceholderText("15,00")).toBeNull();
  });

  it("envia valor zero, porque quanto abate depende da zona", async () => {
    montar();
    await userEvent.selectOptions(campo.tipo(), "FREE_SHIPPING");
    await userEvent.type(campo.codigo(), "FRETEGRATIS");
    await salvar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(enviado()).toMatchObject({ type: "FREE_SHIPPING", value: 0 });
  });
});

describe("as datas no fuso local", () => {
  it("ancora o início no primeiro instante do dia local", async () => {
    montar();
    await preencherValido();
    await userEvent.type(campo.validoDe(), "2026-09-01");
    await salvar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // O ISO enviado, relido como data local, tem de ser o mesmo dia 1º.
    const inicio = new Date(enviado().validFrom);
    expect(inicio.getDate()).toBe(1);
    expect(inicio.getHours()).toBe(0);
  });

  it("ancora o fim no último instante do dia local", async () => {
    // O cupom "válido até 31/08" precisa valer o dia 31 inteiro. Ancorado em
    // UTC, ele morreria às 21h do dia 30 no horário de Brasília.
    montar();
    await preencherValido();
    await userEvent.type(campo.validoAte(), "2026-08-31");
    await salvar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const fim = new Date(enviado().validUntil);
    expect(fim.getDate()).toBe(31);
    expect(fim.getHours()).toBe(23);
  });

  it("manda null quando a data fica em branco", async () => {
    montar();
    await preencherValido();
    await salvar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(enviado()).toMatchObject({ validFrom: null, validUntil: null });
  });
});

describe("editar um cupom existente", () => {
  const existente = {
    id: "cupom-1",
    code: "PROMO10",
    type: "FIXED",
    value: 15,
    minOrder: 50,
    validFrom: new Date("2026-09-01T03:00:00.000Z").toISOString(),
    validUntil: new Date("2026-09-30T02:59:59.999Z").toISOString(),
    active: true,
  };

  it("preenche o formulário com o cupom", () => {
    montar(existente);

    expect((campo.codigo() as HTMLInputElement).value).toBe("PROMO10");
    expect((campo.tipo() as HTMLSelectElement).value).toBe("FIXED");
  });

  it("a data volta para o campo sem pular um dia", () => {
    // Ida e volta precisam fechar: gravado como início do dia 1º local, volta
    // ao campo como "2026-09-01".
    montar(existente);
    expect(campo.validoDe().value).toBe("2026-09-01");
  });

  it("atualiza por PATCH na rota do cupom", async () => {
    montar(existente);
    await salvar();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/coupons/cupom-1",
        expect.objectContaining({ method: "PATCH" })
      )
    );
  });

  it("cria por POST quando não há cupom", async () => {
    montar();
    await preencherValido();
    await salvar();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/coupons",
        expect.objectContaining({ method: "POST" })
      )
    );
  });
});

describe("resposta do servidor", () => {
  it("avisa quando salva", async () => {
    montar();
    await preencherValido();
    await salvar();

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Cupom criado!"));
    expect(onSaved).toHaveBeenCalled();
  });

  it("mostra o motivo da recusa do servidor", async () => {
    // A rota devolve 409 com essa forma quando o código já existe.
    respostaOk = false;
    corpoDeErro = { error: [{ message: "Já existe um cupom com esse código" }] };
    montar();
    await preencherValido();
    await salvar();

    expect(await screen.findByText("Já existe um cupom com esse código")).toBeDefined();
    expect(toastError).toHaveBeenCalledWith("Já existe um cupom com esse código");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("cai numa mensagem genérica quando o erro vem sem forma", async () => {
    respostaOk = false;
    corpoDeErro = {};
    montar();
    await preencherValido();
    await salvar();

    expect(await screen.findByText("Erro ao salvar")).toBeDefined();
  });
});
