// @vitest-environment jsdom
/**
 * O cadastro de item do cardápio.
 *
 * O preço entra como texto e sai como número — é o único lugar do /adm onde o
 * dono digita quanto custa um prato, e um zero perdido aqui vira preço errado no
 * cardápio inteiro. O resto do teste cerca o caminho de erro: upload de imagem
 * que falha e servidor que recusa.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) },
}));

import { MenuItemModal } from "./MenuItemModal";

const fetchMock = vi.fn();
const onSaved = vi.fn();
const onClose = vi.fn();

const categorias = [
  { id: "cat-1", name: "Lanches", slug: "lanches" },
  { id: "cat-2", name: "Bebidas", slug: "bebidas" },
];

const montar = (item: Record<string, unknown> | null = null) =>
  render(
    <MenuItemModal
      open
      onClose={onClose}
      item={item as never}
      categories={categorias}
      onSaved={onSaved}
    />
  );

const campo = {
  nome: () => document.querySelector<HTMLInputElement>('input[name="name"]')!,
  preco: () => document.querySelector<HTMLInputElement>('input[name="price"]')!,
  categoria: () => screen.getByRole("combobox") as HTMLSelectElement,
  imagem: () => screen.getByPlaceholderText("Ou cole uma URL...") as HTMLInputElement,
  arquivo: () => document.querySelector<HTMLInputElement>('input[type="file"]')!,
};

const salvar = () => userEvent.click(screen.getByRole("button", { name: /salvar|criar/i }));
const enviado = () => JSON.parse(String((fetchMock.mock.calls.at(-1)![1] as RequestInit).body));

/** Responde ok por padrão; `json` controla o corpo da recusa. */
function servidor({ ok = true, json = async () => ({}) } = {}) {
  fetchMock.mockResolvedValue({ ok, json });
}

async function preencherValido() {
  await userEvent.type(campo.nome(), "X-Salada");
  await userEvent.type(campo.preco(), "25.90");
}

beforeEach(() => {
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
  it("exige nome", async () => {
    montar();
    await userEvent.type(campo.preco(), "10");
    await salvar();

    expect(await screen.findByText(/nome obrigatório/i)).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Negativo não entra: o campo é `type="number" min="0"` e o próprio input
  // higieniza. A regra do zod é defesa em profundidade, exercitada pelo que
  // *chega* nela — zero e campo vazio.
  it.each([
    ["zero", "0"],
    ["texto, que o campo numérico esvazia", "de graça"],
  ])("recusa preço %s", async (_nome, preco) => {
    montar();
    await userEvent.type(campo.nome(), "X-Salada");
    await userEvent.type(campo.preco(), preco);
    await salvar();

    expect(await screen.findByText(/preço deve ser positivo/i)).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("guarda a URL da imagem num campo que só aceita URL", async () => {
    // `type="url"` impede "foto.png" de chegar ao formulário; a regra do zod
    // continua como segunda barreira para valor colado por outro caminho.
    montar();
    expect(campo.imagem().type).toBe("url");
  });

  it("aceita e envia uma URL válida", async () => {
    montar();
    await preencherValido();
    await userEvent.type(campo.imagem(), "https://exemplo.com/foto.png");
    await salvar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(enviado().imageUrl).toBe("https://exemplo.com/foto.png");
  });
});

describe("o que vai para o servidor", () => {
  it("manda o preço como número, não como texto", async () => {
    montar();
    await preencherValido();
    await salvar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(enviado().price).toBe(25.9);
    expect(typeof enviado().price).toBe("number");
  });

  it("manda null no lugar de campo vazio", async () => {
    montar();
    await preencherValido();
    await salvar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(enviado()).toMatchObject({ imageUrl: null, description: null });
  });

  it("já vem com a primeira categoria escolhida", async () => {
    montar();
    expect(campo.categoria().value).toBe("cat-1");
  });

  it("manda a categoria escolhida", async () => {
    montar();
    await preencherValido();
    await userEvent.selectOptions(campo.categoria(), "cat-2");
    await salvar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(enviado().categoryId).toBe("cat-2");
  });

  it("cria por POST quando não há item", async () => {
    montar();
    await preencherValido();
    await salvar();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/menu", expect.objectContaining({ method: "POST" }))
    );
  });
});

describe("editar item existente", () => {
  const existente = {
    id: "item-1",
    name: "X-Bacon",
    description: "com bacon",
    price: 30,
    imageUrl: "https://exemplo.com/foto.png",
    available: false,
    categoryId: "cat-2",
  };

  it("preenche o formulário com o item", () => {
    montar(existente);

    expect(campo.nome().value).toBe("X-Bacon");
    expect(campo.preco().value).toBe("30");
    expect(campo.categoria().value).toBe("cat-2");
    expect(campo.imagem().value).toBe("https://exemplo.com/foto.png");
  });

  it("atualiza por PUT na rota do item", async () => {
    montar(existente);
    await salvar();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/menu/item-1",
        expect.objectContaining({ method: "PUT" })
      )
    );
  });

  it("preserva o item indisponível ao salvar sem mexer", async () => {
    montar(existente);
    await salvar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(enviado().available).toBe(false);
  });
});

describe("upload de imagem", () => {
  it("preenche a URL com o que o upload devolveu", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://blob/foto.png" }),
    });
    montar();

    await userEvent.upload(campo.arquivo(), new File(["x"], "foto.png", { type: "image/png" }));

    await waitFor(() => expect(campo.imagem().value).toBe("https://blob/foto.png"));
    expect(toastSuccess).toHaveBeenCalledWith("Imagem enviada!");
  });

  it("avisa quando o upload falha, sem mexer na URL", async () => {
    servidor({ ok: false });
    montar();

    await userEvent.upload(campo.arquivo(), new File(["x"], "foto.png", { type: "image/png" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Erro ao enviar imagem"));
    expect(campo.imagem().value).toBe("");
  });
});

describe("resposta do servidor", () => {
  it("avisa quando salva", async () => {
    montar();
    await preencherValido();
    await salvar();

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Item criado!"));
    expect(onSaved).toHaveBeenCalled();
  });

  it("mostra o motivo da recusa", async () => {
    servidor({ ok: false, json: async () => ({ error: [{ message: "Categoria não encontrada" }] }) });
    montar();
    await preencherValido();
    await salvar();

    expect(await screen.findByText("Categoria não encontrada")).toBeDefined();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("não trava o botão quando o erro não vem em JSON", async () => {
    // 502 da plataforma devolve HTML, e `await res.json()` estoura. Sem tratar,
    // a exceção escapa do onSubmit: `setLoading(false)` nunca roda e o botão
    // fica preso em "Salvando..." — o dono não consegue nem tentar de novo.
    servidor({
      ok: false,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    });
    montar();
    await preencherValido();
    await salvar();

    // Selecionado pelo type, e não pelo texto: preso em "Salvando...", o botão
    // deixa de atender por nome — que é exatamente o sintoma.
    const botao = document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await waitFor(() => expect(botao.disabled).toBe(false));
    expect(botao.textContent).toMatch(/salvar/i);
    expect(toastError).toHaveBeenCalled();
  });
});

describe("informações para o cliente", () => {
  // `null` e `false` são coisas diferentes aqui: "Não informado" nunca pode
  // chegar ao servidor como "Não", porque o cardápio passaria a afirmar que o
  // prato não tem lactose sem que o dono tenha dito isso.
  const PERGUNTAS = [
    ["Contém glúten?", /contém glúten/i, "containsGluten"],
    ["Contém lactose?", /contém lactose/i, "containsLactose"],
    ["É vegano?", /é vegano/i, "isVegan"],
  ] as const;

  const opcao = (grupo: RegExp, rotulo: string) =>
    within(screen.getByRole("group", { name: grupo })).getByRole("radio", {
      name: rotulo,
    }) as HTMLInputElement;

  const itemAntigo = {
    id: "item-1",
    name: "X-Bacon",
    description: null,
    price: 30,
    imageUrl: null,
    available: true,
    categoryId: "cat-1",
  };

  it.each(PERGUNTAS)("%s começa em 'Não informado' num item novo", (_titulo, grupo) => {
    montar();
    expect(opcao(grupo, "Não informado").checked).toBe(true);
  });

  it("item anterior à migração, sem os campos, também abre em 'Não informado'", () => {
    montar(itemAntigo);

    for (const [, grupo] of PERGUNTAS) {
      expect(opcao(grupo, "Não informado").checked).toBe(true);
    }
  });

  it("salvar sem mexer manda null nos três, nunca false", async () => {
    montar();
    await preencherValido();
    await salvar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(enviado()).toMatchObject({
      containsGluten: null,
      containsLactose: null,
      isVegan: null,
    });
  });

  it.each(PERGUNTAS)("%s: 'Sim' manda true", async (_titulo, grupo, campoApi) => {
    montar();
    await preencherValido();
    await userEvent.click(opcao(grupo, "Sim"));
    await salvar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(enviado()[campoApi]).toBe(true);
  });

  it.each(PERGUNTAS)("%s: 'Não' manda false", async (_titulo, grupo, campoApi) => {
    montar();
    await preencherValido();
    await userEvent.click(opcao(grupo, "Não"));
    await salvar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(enviado()[campoApi]).toBe(false);
  });

  it("carrega o que o item já declara", () => {
    montar({ ...itemAntigo, containsGluten: false, containsLactose: true, isVegan: null });

    expect(opcao(/contém glúten/i, "Não").checked).toBe(true);
    expect(opcao(/contém lactose/i, "Sim").checked).toBe(true);
    expect(opcao(/é vegano/i, "Não informado").checked).toBe(true);
  });

  it("dá para voltar uma declaração para 'Não informado'", async () => {
    montar({ ...itemAntigo, containsLactose: false });
    await userEvent.click(opcao(/contém lactose/i, "Não informado"));
    await salvar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(enviado().containsLactose).toBeNull();
  });

  it("avisa sobre contaminação cruzada, porque o cliente vai confiar", () => {
    montar();
    expect(screen.getByText(/contaminação cruzada/i)).toBeDefined();
  });
});
