import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// --- mocks -------------------------------------------------------------
//
// Nenhum destes três é I/O de verdade: o token é gravado via
// prismaUnscoped (mockado), o e-mail sai via Resend (mockado), e a URL do
// restaurante é pura (mas mockada aqui para controlar exatamente o host
// que aparece no link, sem depender de ROOT_DOMAIN no ambiente de teste).

const tokenCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    passwordResetToken: {
      create: (...args: unknown[]) => tokenCreate(...args),
    },
  },
}));

const enviarEmail = vi.fn();
vi.mock("@/lib/resend", () => ({
  getResend: () => ({ emails: { send: (...args: unknown[]) => enviarEmail(...args) } }),
}));

vi.mock("@/lib/tenant-provisioning", () => ({
  buildTenantBaseUrl: (slug: string) => `https://${slug}.munoapp.com.br`,
}));

const { enviarBoasVindas } = await import("@/lib/assinatura/email-boas-vindas");

beforeEach(() => {
  vi.clearAllMocks();
  tokenCreate.mockResolvedValue({ token: "token-gerado" });
  enviarEmail.mockResolvedValue({ data: { id: "email-1" } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("e-mail de boas-vindas", () => {
  // 7 dias, e não a 1 hora do "esqueci a senha": aquela é curta porque a
  // pessoa acabou de pedir. Esta precisa sobreviver a quem paga meia-noite e
  // lê o e-mail de manhã.
  it("cria token de sete dias", async () => {
    const agora = new Date("2026-08-26T12:00:00Z");
    vi.setSystemTime(agora);

    await enviarBoasVindas({
      tenantId: "t1", slug: "pizzaria", email: "a@b.c", nome: "Pizzaria",
    });

    const { expiresAt } = tokenCreate.mock.calls[0][0].data;
    expect(expiresAt).toEqual(new Date("2026-09-02T12:00:00Z"));
  });

  it("manda o link no domínio do restaurante, não no da plataforma", async () => {
    await enviarBoasVindas({
      tenantId: "t1", slug: "pizzaria", email: "a@b.c", nome: "Pizzaria",
    });

    const { html } = enviarEmail.mock.calls[0][0];
    expect(html).toContain("pizzaria.munoapp.com.br/redefinir-senha?token=");
  });

  it("usa o token gravado no banco, não um valor inventado", async () => {
    tokenCreate.mockResolvedValue({ token: "abc-123-especifico" });

    await enviarBoasVindas({
      tenantId: "t1", slug: "pizzaria", email: "a@b.c", nome: "Pizzaria",
    });

    const { html } = enviarEmail.mock.calls[0][0];
    expect(html).toContain("token=abc-123-especifico");
  });

  it("grava o token com o tenantId e o email recebidos", async () => {
    await enviarBoasVindas({
      tenantId: "tenant-xyz", slug: "pizzaria", email: "dono@pizzaria.com", nome: "Pizzaria",
    });

    expect(tokenCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-xyz",
        email: "dono@pizzaria.com",
      }),
    });
  });

  // A garantia real é estrutural, não este teste: enviarBoasVindas nem
  // RECEBE uma senha como parâmetro (a assinatura só tem tenantId, slug,
  // email, nome — ver o tipo de `input` acima), então não há como uma
  // senha entrar no corpo por este caminho. O teste abaixo é só uma rede
  // de segurança best-effort contra a frase mais óbvia, não uma prova de
  // ausência — se alguém reformular o texto ("aqui está sua chave de
  // acesso", por exemplo), ele não pega isso.
  it("best-effort: o texto fixo do e-mail não contém a frase 'sua senha é'", async () => {
    await enviarBoasVindas({
      tenantId: "t1", slug: "pizzaria", email: "a@b.c", nome: "Pizzaria",
    });

    const { html } = enviarEmail.mock.calls[0][0];
    expect(html.toLowerCase()).not.toContain("sua senha é");
  });

  it("manda para o email do destinatário recebido", async () => {
    await enviarBoasVindas({
      tenantId: "t1", slug: "pizzaria", email: "dono@pizzaria.com", nome: "Pizzaria",
    });

    expect(enviarEmail.mock.calls[0][0].to).toBe("dono@pizzaria.com");
  });

  // --- escape: `nome` e `email` vêm do que o cliente digitou no checkout
  // (Inscricao.nome/.email), texto livre sem restrição de caractere — ver
  // o schema de /api/assinar. Sem escapar, um nome como o do teste abaixo
  // quebra a marcação do e-mail ou injeta conteúdo na mensagem. ---

  it("escapa nome com aspas, `<`, `>` e `&` antes de colocar no HTML", async () => {
    await enviarBoasVindas({
      tenantId: "t1",
      slug: "pizzaria",
      email: "a@b.c",
      nome: `Bar do "Zé" <script>alert(1)</script> & Cia`,
    });

    const { html } = enviarEmail.mock.calls[0][0];
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;Zé&quot;");
    expect(html).toContain("&amp; Cia");
  });

  it("escapa o email antes de colocar no HTML", async () => {
    await enviarBoasVindas({
      tenantId: "t1",
      slug: "pizzaria",
      email: `a<b>@c.com`,
      nome: "Pizzaria",
    });

    const { html } = enviarEmail.mock.calls[0][0];
    expect(html).not.toContain("a<b>@c.com");
    expect(html).toContain("a&lt;b&gt;@c.com");
  });

  // Campo de cabeçalho de e-mail, não HTML: o risco de uma quebra de linha
  // no assunto é injeção de um cabeçalho novo (ex.: um Bcc: extra), não
  // marcação quebrada — por isso aqui o requisito é "sem \n", não escape.
  it("remove quebra de linha do nome antes de montar o subject, para não permitir injeção de cabeçalho", async () => {
    await enviarBoasVindas({
      tenantId: "t1",
      slug: "pizzaria",
      email: "a@b.c",
      nome: "Pizzaria\nBcc: atacante@mal.com",
    });

    const { subject } = enviarEmail.mock.calls[0][0];
    expect(subject).not.toContain("\n");
    expect(subject).not.toContain("\r");
  });

  // O SDK do Resend NÃO lança quando a API recusa o envio: devolve
  // { data: null, error }. Sem conferir esse retorno, `await send(...)`
  // resolve com sucesso e a falha some — o try/catch de quem chama nunca
  // dispara, e nenhum log sai. É o pior desfecho possível aqui: o cliente
  // pagou, o restaurante nasceu, e o único e-mail que dá acesso a ele não
  // saiu, sem deixar rastro. Quem chama trata a exceção; o que não pode é
  // não haver exceção.
  it("lança quando o Resend recusa o envio, em vez de resolver em silêncio", async () => {
    enviarEmail.mockResolvedValue({
      data: null,
      error: { statusCode: 403, name: "validation_error", message: "The munoapp.com.br domain is not verified." },
    });

    await expect(
      enviarBoasVindas({
        tenantId: "t1", slug: "pizzaria", email: "a@b.c", nome: "Pizzaria",
      })
    ).rejects.toThrow(/domain is not verified/);
  });
});
