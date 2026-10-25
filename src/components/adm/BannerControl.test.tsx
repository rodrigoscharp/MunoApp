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
});
