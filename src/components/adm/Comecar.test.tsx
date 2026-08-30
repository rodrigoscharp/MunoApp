// @vitest-environment jsdom
/**
 * O onboarding de quem acabou de comprar.
 *
 * O teste que mais importa aqui é o da ORDEM: /api/menu exige categoryId e
 * restaurante recém-provisionado nasce com zero categorias, então o passo tem
 * que criar a categoria antes do item. Invertido, o primeiro item que o
 * cliente tenta cadastrar na vida dele falha com 400.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Comecar } from "./Comecar";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ id: "cat-1" }),
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { href: "" },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const rotasChamadas = () => fetchMock.mock.calls.map((c) => c[0]);
const corpoDe = (rota: string) =>
  JSON.parse(String(fetchMock.mock.calls.find((c) => c[0] === rota)![1].body));

describe("Comecar", () => {
  it("salva a identidade no passo 1", async () => {
    const user = userEvent.setup();
    render(
      <Comecar
        nomeRestaurante="Cantina da Ana"
        enderecoPreenchido={false}
        temItem={false}
      />
    );

    await user.type(screen.getByLabelText(/endereço/i), "Rua A, 10, Ubatuba");
    await user.click(screen.getByRole("button", { name: /salvar e continuar/i }));

    await waitFor(() => {
      expect(rotasChamadas()).toContain("/api/settings/restaurant");
    });
    expect(corpoDe("/api/settings/restaurant").address).toBe("Rua A, 10, Ubatuba");
    // O schema exige `name`, e o nome do restaurante já existe desde o
    // provisionamento: mandá-lo junto evita apagar o que já estava certo.
    expect(corpoDe("/api/settings/restaurant").name).toBe("Cantina da Ana");
  });

  it("cria a categoria antes do item", async () => {
    const user = userEvent.setup();
    render(
      <Comecar nomeRestaurante="Cantina da Ana" enderecoPreenchido temItem={false} />
    );

    await user.type(screen.getByLabelText(/categoria/i), "Lanches");
    await user.type(screen.getByLabelText(/nome do item/i), "X-Salada");
    await user.type(screen.getByLabelText(/preço/i), "25");
    await user.click(screen.getByRole("button", { name: /salvar item/i }));

    await waitFor(() => {
      expect(rotasChamadas()).toContain("/api/menu");
    });
    const rotas = rotasChamadas();
    expect(rotas.indexOf("/api/categories")).toBeLessThan(
      rotas.indexOf("/api/menu")
    );
  });

  it("manda o categoryId devolvido pela criação da categoria", async () => {
    const user = userEvent.setup();
    render(
      <Comecar nomeRestaurante="Cantina da Ana" enderecoPreenchido temItem={false} />
    );

    await user.type(screen.getByLabelText(/categoria/i), "Lanches");
    await user.type(screen.getByLabelText(/nome do item/i), "X-Salada");
    await user.type(screen.getByLabelText(/preço/i), "25");
    await user.click(screen.getByRole("button", { name: /salvar item/i }));

    await waitFor(() => {
      expect(rotasChamadas()).toContain("/api/menu");
    });
    expect(corpoDe("/api/menu").categoryId).toBe("cat-1");
    expect(corpoDe("/api/menu").price).toBe(25);
  });

  it("começa no passo do cardápio quando a identidade já está pronta", () => {
    render(
      <Comecar nomeRestaurante="Cantina da Ana" enderecoPreenchido temItem={false} />
    );

    expect(screen.getByLabelText(/nome do item/i)).toBeTruthy();
    expect(screen.queryByLabelText(/endereço/i)).toBeNull();
  });

  it("deixar para depois avisa o servidor", async () => {
    const user = userEvent.setup();
    render(
      <Comecar
        nomeRestaurante="Cantina da Ana"
        enderecoPreenchido={false}
        temItem={false}
      />
    );

    await user.click(screen.getByRole("button", { name: /deixar para depois/i }));

    await waitFor(() => {
      expect(rotasChamadas()).toContain("/api/settings/onboarding");
    });
  });

  // Falha de rede no meio do onboarding não pode virar tela muda: a pessoa
  // acabou de pagar e está montando a casa dela.
  it("mostra o erro quando o servidor recusa", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Endereço inválido" }),
    } as Response);
    render(
      <Comecar
        nomeRestaurante="Cantina da Ana"
        enderecoPreenchido={false}
        temItem={false}
      />
    );

    await user.type(screen.getByLabelText(/endereço/i), "x");
    await user.click(screen.getByRole("button", { name: /salvar e continuar/i }));

    expect(await screen.findByText(/Endereço inválido/)).toBeTruthy();
  });
});
