// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { toastSuccess, toastError } = vi.hoisted(() => ({ toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

import { BannerControl } from "./BannerControl";

const itens = [
  { id: "a", name: "X-Bacon", price: 40, imageUrl: "/a.jpg", imagemRecortadaUrl: "/a-recorte.webp" },
  { id: "b", name: "X-Salada", price: 25, imageUrl: "/b.jpg", imagemRecortadaUrl: null },
];
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const enviado = () => JSON.parse(String(fetchMock.mock.calls[0][1].body));

describe("BannerControl", () => {
  it("abre no automático e salva assim sem mexer", async () => {
    render(<BannerControl initial={{ modo: "mais-vendido", itemId: null, chamada: "" }} itens={itens} />);
    expect((screen.getByLabelText(/mais vendido, automático/i) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: /salvar banner/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/settings/banner");
    expect(enviado()).toMatchObject({ modo: "mais-vendido" });
  });

  it("escolher um item manda o item e a chamada", async () => {
    render(<BannerControl initial={{ modo: "mais-vendido", itemId: null, chamada: "" }} itens={itens} />);
    await userEvent.click(screen.getByLabelText(/escolher um item/i));
    await userEvent.selectOptions(screen.getByLabelText(/item do banner/i), "a");
    await userEvent.type(screen.getByLabelText(/chamada/i), "Lançamento");
    await userEvent.click(screen.getByRole("button", { name: /salvar banner/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(enviado()).toEqual({ modo: "item", itemId: "a", chamada: "Lançamento" });
  });

  it("avisa quando o item escolhido não tem foto sem fundo", async () => {
    render(<BannerControl initial={{ modo: "item", itemId: "b", chamada: "" }} itens={itens} />);
    screen.getByText(/ainda não tem foto sem fundo/i);
  });

  it("item salvo que esgotou: avisa pelo nome e não regrava o id velho", async () => {
    render(
      <BannerControl initial={{ modo: "item", itemId: "sumiu", chamada: "" }} itens={itens} nomeDoItemSalvo="X-Tudo" />
    );
    screen.getByText(/X-Tudo\) está indisponível/i);
    expect((screen.getByLabelText(/item do banner/i) as HTMLSelectElement).value).toBe("");
    await userEvent.click(screen.getByRole("button", { name: /salvar banner/i }));
    expect(toastError).toHaveBeenCalledWith("Escolha o item do banner");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("item salvo que foi apagado: avisa, e o aviso some ao escolher outro", async () => {
    render(<BannerControl initial={{ modo: "item", itemId: "sumiu", chamada: "" }} itens={itens} />);
    screen.getByText(/não está mais no cardápio/i);
    await userEvent.selectOptions(screen.getByLabelText(/item do banner/i), "a");
    expect(screen.queryByText(/não está mais no cardápio/i)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /salvar banner/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(enviado()).toMatchObject({ itemId: "a" });
  });
});

describe("prévia do banner", () => {
  // Sexta, 22h em Brasília: já é sábado em UTC, e a prévia tem de dizer sexta.
  const SEXTA_A_NOITE = "2026-10-24T01:00:00.000Z";
  const previa = () => screen.getByRole("figure", { name: /prévia do banner/i });

  it("no automático mostra o mais vendido, com o dia de Brasília", () => {
    render(
      <BannerControl
        initial={{ modo: "mais-vendido", itemId: null, chamada: "" }}
        itens={itens}
        automatico={{ item: itens[1], modo: "mais-vendido" }}
        agora={SEXTA_A_NOITE}
      />
    );
    expect(previa().textContent).toContain("SEXTA · O MAIS PEDIDO");
    expect(previa().textContent).toContain("X-Salada");
    // O Intl separa "R$" do número com espaço não separável.
    expect(previa().textContent).toMatch(/por R\$\s25(?!,)/);
  });

  it("sem venda no mês, não promete o mais pedido", () => {
    render(
      <BannerControl
        initial={{ modo: "mais-vendido", itemId: null, chamada: "" }}
        itens={itens}
        automatico={{ item: itens[1], modo: "destaque" }}
        agora={SEXTA_A_NOITE}
      />
    );
    expect(previa().textContent).toContain("SEXTA · DESTAQUE DA CASA");
  });

  it("escolher um item troca a prévia e leva a chamada digitada", async () => {
    render(
      <BannerControl
        initial={{ modo: "mais-vendido", itemId: null, chamada: "" }}
        itens={itens}
        automatico={{ item: itens[1], modo: "mais-vendido" }}
        agora={SEXTA_A_NOITE}
      />
    );
    await userEvent.click(screen.getByLabelText(/escolher um item/i));
    await userEvent.selectOptions(screen.getByLabelText(/item do banner/i), "a");
    await userEvent.type(screen.getByLabelText(/chamada/i), "Lançamento");

    expect(previa().textContent).toContain("SEXTA · LANÇAMENTO");
    expect(previa().textContent).toContain("X-Bacon");
  });

  it("sem item nenhum disponível, diz que o banner não aparece", () => {
    render(<BannerControl initial={{ modo: "mais-vendido", itemId: null, chamada: "" }} itens={[]} />);
    screen.getByText(/o banner só aparece quando houver um/i);
  });
});
