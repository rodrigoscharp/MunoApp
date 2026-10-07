import { beforeEach, describe, expect, it, vi } from "vitest";

const reportarErro = vi.fn();
vi.mock("@/lib/observabilidade", () => ({
  reportarErro: (...a: unknown[]) => reportarErro(...a),
}));

const { onRequestError } = await import("./instrumentation");

const requisicao = {
  path: "/mesa/token-da-mesa?x=1",
  method: "GET",
  headers: {},
};
const contexto = {
  routerKind: "App Router",
  routePath: "/mesa/[token]",
  routeType: "render",
  revalidateReason: undefined,
} as const;

function erroComNome(nome: string, mensagem = "aborted") {
  const erro = new Error(mensagem);
  erro.name = nome;
  return erro;
}

beforeEach(() => {
  reportarErro.mockReset();
});

// Cliente que fecha a aba no meio da renderização não é erro nosso. Contado
// como erro de rota, cada cardápio fechado cedo empurraria a peça para o
// vermelho, e o monitor responderia 503 por algo que não quebrou.
describe("onRequestError", () => {
  it.each([
    ["AbortError", erroComNome("AbortError")],
    ["ResponseAborted", erroComNome("ResponseAborted")],
    ["stream fechado cedo", new Error("The destination stream closed early.")],
    ["stream com erro na escrita", new Error("The destination stream errored while writing data.")],
  ])("não reporta a conexão que o cliente abandonou (%s)", async (_, erro) => {
    await onRequestError(erro, requisicao, contexto);

    expect(reportarErro).not.toHaveBeenCalled();
  });

  it("reporta o erro comum com a rota na origem, sem o caminho real", async () => {
    const erro = new Error("coluna não existe");

    await onRequestError(erro, requisicao, contexto);

    expect(reportarErro).toHaveBeenCalledWith({
      origem: "render:/mesa/[token]",
      erro,
      extra: { metodo: "GET" },
    });
  });

  // Comparação exata, e não "contém": uma mensagem nossa que cite a frase do
  // React continua sendo erro nosso.
  it("reporta a mensagem que só contém a frase do React", async () => {
    const erro = new Error("falha ao gerar o PDF: The destination stream closed early.");

    await onRequestError(erro, requisicao, contexto);

    expect(reportarErro).toHaveBeenCalledOnce();
  });
});
