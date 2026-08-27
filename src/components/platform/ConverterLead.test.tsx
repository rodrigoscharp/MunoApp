// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConverterLead } from "./ConverterLead";

// Este componente cria RESTAURANTE DE VERDADE a partir de um lead do CRM, e
// mostra uma senha que não é recuperável depois. É o caminho manual, usado
// quando alguém fecha por WhatsApp em vez de passar pelo checkout.

const fetchMock = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

function respostaJson(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(body),
  } as Response);
}

const CRIADO = {
  url: "https://pizzaria-do-ze.munoapp.com.br",
  email: "dono@pizzaria.com",
  senha: "senha-que-so-aparece-uma-vez",
};

beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(() => respostaJson(CRIADO));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** O formulário só existe depois de abrir o painel. */
async function abrir(user: ReturnType<typeof userEvent.setup>) {
  render(<ConverterLead leadId="lead-1" restauranteNome="Pizzaria do Zé" />);
  await user.click(screen.getByRole("button", { name: /converter em cliente/i }));
}

const corpoEnviado = () => JSON.parse(fetchMock.mock.calls[0][1].body);

describe("ConverterLead", () => {
  it("sugere o endereço a partir do nome do restaurante do lead", async () => {
    const user = userEvent.setup();
    await abrir(user);

    expect((screen.getByLabelText(/endereço do restaurante/i) as HTMLInputElement).value)
      .toBe("pizzaria-do-ze");
  });

  it("sugere a mensalidade do plano escolhido, vinda de PRECOS", async () => {
    const user = userEvent.setup();
    await abrir(user);

    await user.click(screen.getByRole("button", { name: /membro \+ mesas qr/i }));

    expect((screen.getByLabelText(/mensalidade/i) as HTMLInputElement).value).toBe("149.99");
  });

  // Desconto e valor negociado caso a caso vivem neste campo. Trocar de plano
  // depois de o operador digitar sobrescreveria a negociação sem ele notar.
  it("para de sugerir depois que o operador digita a mensalidade", async () => {
    const user = userEvent.setup();
    await abrir(user);
    const campo = screen.getByLabelText(/mensalidade/i) as HTMLInputElement;

    await user.type(campo, "89.90");
    await user.click(screen.getByRole("button", { name: /membro \+ mesas qr/i }));

    // O campo é type="number" e normaliza "89.90" para "89.9" — o que importa
    // é que a troca de plano NÃO o sobrescreveu pela sugestão.
    expect(Number(campo.value)).toBe(89.9);
    expect(campo.value).not.toBe("149.99");
  });

  // Sem valor não se cria assinatura, e mandar vencimento ou cortesia soltos
  // faria a rota receber campo que ela não tem onde guardar.
  it("não manda vencimento nem cortesia quando não há mensalidade", async () => {
    const user = userEvent.setup();
    await abrir(user);

    await user.type(screen.getByLabelText(/e-mail do dono/i), "dono@pizzaria.com");
    await user.click(screen.getByRole("button", { name: /^criar cliente$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const corpo = corpoEnviado();
    expect(corpo.valorMensal).toBeUndefined();
    expect(corpo.diaVencimento).toBeUndefined();
    expect(corpo.diasDeCortesia).toBeUndefined();
  });

  // O caminho que torna o guarda necessário: os campos de vencimento e
  // cortesia só APARECEM quando há mensalidade, mas o estado deles sobrevive
  // a apagar a mensalidade depois. Sem `mensalidade.trim() &&` no corpo, o
  // operador que desistisse da cobrança mandaria vencimento solto para uma
  // rota que não tem onde guardá-lo.
  it("apagar a mensalidade depois também tira vencimento e cortesia do corpo", async () => {
    const user = userEvent.setup();
    await abrir(user);

    await user.type(screen.getByLabelText(/e-mail do dono/i), "dono@pizzaria.com");
    const campoMensalidade = screen.getByLabelText(/mensalidade/i);
    await user.type(campoMensalidade, "119.99");
    await user.type(screen.getByLabelText(/dia do vencimento/i), "10");
    await user.type(screen.getByLabelText(/dias de cortesia/i), "15");
    await user.clear(campoMensalidade);

    // Some da tela, mas o estado continua preenchido.
    expect(screen.queryByLabelText(/dia do vencimento/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: /^criar cliente$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const corpo = corpoEnviado();
    expect(corpo.valorMensal).toBeUndefined();
    expect(corpo.diaVencimento).toBeUndefined();
    expect(corpo.diasDeCortesia).toBeUndefined();
  });

  it("manda vencimento e cortesia como número quando há mensalidade", async () => {
    const user = userEvent.setup();
    await abrir(user);

    await user.type(screen.getByLabelText(/e-mail do dono/i), "dono@pizzaria.com");
    await user.type(screen.getByLabelText(/mensalidade/i), "119.99");
    await user.type(screen.getByLabelText(/dia do vencimento/i), "10");
    await user.type(screen.getByLabelText(/dias de cortesia/i), "15");
    await user.click(screen.getByRole("button", { name: /^criar cliente$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(corpoEnviado()).toMatchObject({
      valorMensal: 119.99,
      diaVencimento: 10,
      diasDeCortesia: 15,
    });
  });

  // A SENHA APARECE UMA VEZ SÓ e não é recuperável. router.refresh()
  // re-renderiza a página e a apagaria da tela — por isso ele só acontece no
  // "Já anotei", nunca ao receber a resposta.
  it("mostra a senha e NÃO atualiza a página, que apagaria a senha da tela", async () => {
    const user = userEvent.setup();
    await abrir(user);

    await user.type(screen.getByLabelText(/e-mail do dono/i), "dono@pizzaria.com");
    await user.click(screen.getByRole("button", { name: /^criar cliente$/i }));

    await waitFor(() =>
      expect(screen.getByText("senha-que-so-aparece-uma-vez")).toBeTruthy()
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("só atualiza a página depois de o operador confirmar que anotou", async () => {
    const user = userEvent.setup();
    await abrir(user);

    await user.type(screen.getByLabelText(/e-mail do dono/i), "dono@pizzaria.com");
    await user.click(screen.getByRole("button", { name: /^criar cliente$/i }));
    await waitFor(() => expect(screen.getByText(/cliente criado/i)).toBeTruthy());

    await user.click(screen.getByRole("button", { name: /já anotei/i }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("mostra o erro que a API devolveu", async () => {
    const user = userEvent.setup();
    await abrir(user);
    fetchMock.mockImplementation(() =>
      respostaJson({ error: "Este endereço já está em uso." }, false)
    );

    await user.type(screen.getByLabelText(/e-mail do dono/i), "dono@pizzaria.com");
    await user.click(screen.getByRole("button", { name: /^criar cliente$/i }));

    await waitFor(() =>
      expect(screen.getByText(/este endereço já está em uso/i)).toBeTruthy()
    );
  });

  // A rota pode devolver `error` como objeto (ex.: issues do zod). Jogar isso
  // direto no JSX quebraria a renderização inteira do painel.
  it("erro que não é texto vira mensagem genérica, sem quebrar a tela", async () => {
    const user = userEvent.setup();
    await abrir(user);
    fetchMock.mockImplementation(() => respostaJson({ error: { campo: "slug" } }, false));

    await user.type(screen.getByLabelText(/e-mail do dono/i), "dono@pizzaria.com");
    await user.click(screen.getByRole("button", { name: /^criar cliente$/i }));

    await waitFor(() =>
      expect(screen.getByText(/não foi possível converter este lead/i)).toBeTruthy()
    );
  });

  // Sem o finally, o botão ficaria travado em "Criando..." e o operador não
  // saberia se o cliente foi criado ou não.
  it("rede caída libera o botão de volta, em vez de travar em Criando", async () => {
    const user = userEvent.setup();
    await abrir(user);
    fetchMock.mockImplementation(() => Promise.reject(new Error("offline")));

    await user.type(screen.getByLabelText(/e-mail do dono/i), "dono@pizzaria.com");
    await user.click(screen.getByRole("button", { name: /^criar cliente$/i }));

    await waitFor(() => expect(screen.getByText(/sem conexão/i)).toBeTruthy());
    const botao = screen.getByRole("button", { name: /^criar cliente$/i }) as HTMLButtonElement;
    expect(botao.disabled).toBe(false);
  });
});
