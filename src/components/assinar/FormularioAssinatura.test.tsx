// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormularioAssinatura } from "./FormularioAssinatura";

// Primeiro teste de componente do projeto. O ambiente jsdom é pedido no topo
// deste arquivo, não no vitest.config: as centenas de suítes de lógica pura
// não precisam de DOM e não deveriam pagar por ele.
//
// Só duas coisas são simuladas — fetch e window.location —, e as duas são
// I/O. A lógica do formulário (sugestão de slug, debounce, máscara, quando o
// botão libera) roda de verdade.

const fetchMock = vi.fn();

/** Respostas de /api/assinar/slug e /api/assinar, na forma que a rota devolve. */
function respostaJson(body: unknown, ok = true, status = ok ? 200 : 400) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

function slugLivre() {
  return respostaJson({ livre: true });
}

let destino: string;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  destino = "";
  // mockReset e não só mockImplementation: sem limpar o histórico, mock.calls
  // acumula entre os `it` e um `.find()` devolve a chamada de um teste
  // anterior — o teste passa ou falha por um motivo que nada tem a ver com o
  // que ele afirma. Mesma armadilha documentada em asaas.test.ts.
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // window.location.href = ... navegaria de verdade no jsdom e emitiria erro
  // de "not implemented". Trocamos só o setter, e guardamos para onde foi.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      get href() {
        return destino;
      },
      set href(v: string) {
        destino = v;
      },
    },
  });
  fetchMock.mockImplementation((url: string) =>
    String(url).startsWith("/api/assinar/slug") ? slugLivre() : respostaJson({})
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Preenche o formulário inteiro com dados que passam em toda a validação. */
async function preencherTudo(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/nome do restaurante/i), "Pizzaria do Ze");
  await user.type(screen.getByLabelText(/e-mail/i), "dono@pizzaria.com");
  // CPF válido pelo dígito verificador — isValidCpfCnpj roda de verdade aqui.
  await user.type(screen.getByLabelText(/cpf ou cnpj/i), "24971563792");
  await vi.advanceTimersByTimeAsync(500);
  await waitFor(() => expect(screen.getByText(/endereço disponível/i)).toBeTruthy());
}

const botao = () => screen.getByRole("button", { name: /ir para pagamento/i }) as HTMLButtonElement;

describe("FormularioAssinatura", () => {
  // O CASO QUE ESTE ARQUIVO EXISTE PARA PEGAR. setLoading(true) acontece antes
  // do fetch, e o ramo de !res.ok retornava sem devolver o loading para false
  // — só o catch resetava. Como `podeEnviar` inclui `!loading`, qualquer erro
  // da API (endereço indisponível, muitas tentativas, gateway fora do ar)
  // deixava o botão desabilitado PARA SEMPRE: a pessoa lia a mensagem e não
  // conseguia corrigir nada, no meio de uma compra.
  it("deixa tentar de novo depois de um erro da API", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FormularioAssinatura plano="MEMBRO" ciclo="MENSAL" />);
    await preencherTudo(user);

    fetchMock.mockImplementation((url: string) =>
      String(url).startsWith("/api/assinar/slug")
        ? slugLivre()
        : respostaJson({ error: "Endereço indisponível" }, false)
    );

    await user.click(botao());

    await waitFor(() =>
      expect(screen.getByText(/endereço indisponível/i)).toBeTruthy()
    );
    expect(botao().disabled).toBe(false);
  });

  it("mostra a mensagem que a API devolveu, não uma genérica", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FormularioAssinatura plano="MEMBRO" ciclo="MENSAL" />);
    await preencherTudo(user);

    fetchMock.mockImplementation((url: string) =>
      String(url).startsWith("/api/assinar/slug")
        ? slugLivre()
        : respostaJson({ error: "Muitas tentativas. Tente de novo em alguns minutos." }, false)
    );

    await user.click(botao());

    await waitFor(() =>
      expect(screen.getByText(/muitas tentativas/i)).toBeTruthy()
    );
  });

  it("sugere o endereço a partir do nome digitado", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FormularioAssinatura plano="MEMBRO" ciclo="MENSAL" />);

    await user.type(screen.getByLabelText(/nome do restaurante/i), "Açaí do Zé");

    expect((screen.getByLabelText(/endereço do seu cardápio/i) as HTMLInputElement).value)
      .toBe("acai-do-ze");
  });

  // Depois que a pessoa escolheu o próprio endereço, continuar digitando o
  // nome não pode sobrescrever a escolha dela.
  it("para de sugerir depois que a pessoa edita o endereço na mão", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FormularioAssinatura plano="MEMBRO" ciclo="MENSAL" />);
    const campoSlug = screen.getByLabelText(/endereço do seu cardápio/i) as HTMLInputElement;

    await user.type(screen.getByLabelText(/nome do restaurante/i), "Pizzaria");
    await user.clear(campoSlug);
    await user.type(campoSlug, "meu-endereco");
    await user.type(screen.getByLabelText(/nome do restaurante/i), " do Ze");

    expect(campoSlug.value).toBe("meu-endereco");
  });

  // O comentário do efeito descreve o risco: sem descartar a resposta que
  // chegou para um slug antigo, o botão liberaria para um endereço que na
  // verdade está ocupado — e a pessoa pagaria por ele.
  it("resposta de um endereço já trocado não libera o botão", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FormularioAssinatura plano="MEMBRO" ciclo="MENSAL" />);

    // A consulta do primeiro slug demora; a do segundo responde "ocupado".
    let resolverPrimeira: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((r) => { resolverPrimeira = r; })
    );
    fetchMock.mockImplementation(() => respostaJson({ livre: false, motivo: "EM_USO" }));

    const campoSlug = screen.getByLabelText(/endereço do seu cardápio/i) as HTMLInputElement;
    await user.type(campoSlug, "primeiro");
    await vi.advanceTimersByTimeAsync(500);
    await user.clear(campoSlug);
    await user.type(campoSlug, "segundo");
    await vi.advanceTimersByTimeAsync(500);

    // A resposta atrasada do "primeiro" chega agora, dizendo que está livre.
    resolverPrimeira({ ok: true, status: 200, json: () => Promise.resolve({ livre: true }) } as Response);
    await vi.advanceTimersByTimeAsync(50);

    expect(screen.queryByText(/endereço disponível/i)).toBeNull();
    expect(botao().disabled).toBe(true);
  });

  // Fail-closed: melhor pedir para tentar de novo do que deixar pagar por um
  // endereço que talvez já não esteja livre.
  it("rede caída trata o endereço como indisponível", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FormularioAssinatura plano="MEMBRO" ciclo="MENSAL" />);

    fetchMock.mockImplementation(() => Promise.reject(new Error("offline")));
    await user.type(screen.getByLabelText(/endereço do seu cardápio/i), "pizzaria");
    await vi.advanceTimersByTimeAsync(500);

    await waitFor(() => expect(screen.getByText(/indisponível/i)).toBeTruthy());
    expect(botao().disabled).toBe(true);
  });

  // O waitFor por "Endereço disponível" não é enfeite: sem ele o botão está
  // travado porque a checagem de endereço ainda não assentou, e o teste
  // passaria mesmo que a validação de CPF fosse removida — descoberto por
  // mutação, com o teste passando feliz. Esperar o endereço ficar livre
  // deixa o CPF como única razão possível para o botão continuar travado.
  it("CPF com dígito verificador errado mantém o botão travado", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FormularioAssinatura plano="MEMBRO" ciclo="MENSAL" />);

    await user.type(screen.getByLabelText(/nome do restaurante/i), "Pizzaria do Ze");
    await user.type(screen.getByLabelText(/e-mail/i), "dono@pizzaria.com");
    await user.type(screen.getByLabelText(/cpf ou cnpj/i), "11111111111");
    await vi.advanceTimersByTimeAsync(500);
    await waitFor(() => expect(screen.getByText(/endereço disponível/i)).toBeTruthy());

    expect(screen.getByText(/documento inválido/i)).toBeTruthy();
    expect(botao().disabled).toBe(true);
  });

  // A API recusa MENSAL+PIX com 400. A escolha de método nem aparece no
  // mensal, e o corpo enviado precisa refletir isso.
  it("no ciclo mensal manda sempre CREDIT_CARD, sem oferecer escolha", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FormularioAssinatura plano="MEMBRO" ciclo="MENSAL" />);
    await preencherTudo(user);

    expect(screen.queryByRole("button", { name: /^pix$/i })).toBeNull();

    await user.click(botao());

    const chamada = fetchMock.mock.calls.find(([url]) => url === "/api/assinar");
    expect(JSON.parse(chamada![1].body).metodo).toBe("CREDIT_CARD");
  });

  it("no ciclo anual manda o método escolhido", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FormularioAssinatura plano="MEMBRO" ciclo="ANUAL" />);
    await preencherTudo(user);

    await user.click(screen.getByRole("button", { name: /^pix$/i }));
    await user.click(botao());

    const chamada = fetchMock.mock.calls.find(([url]) => url === "/api/assinar");
    expect(JSON.parse(chamada![1].body).metodo).toBe("PIX");
  });

  // O cartão é digitado no domínio do Asaas, nunca numa página nossa — é o
  // que dispensa afrouxar Permissions-Policy e X-Frame-Options.
  it("manda o cliente para a URL de pagamento que a API devolveu", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FormularioAssinatura plano="MEMBRO" ciclo="MENSAL" />);
    await preencherTudo(user);

    fetchMock.mockImplementation((url: string) =>
      String(url).startsWith("/api/assinar/slug")
        ? slugLivre()
        : respostaJson({ checkoutUrl: "https://sandbox.asaas.com/i/abc123" })
    );

    await user.click(botao());

    await waitFor(() =>
      expect(destino).toBe("https://sandbox.asaas.com/i/abc123")
    );
  });
});
