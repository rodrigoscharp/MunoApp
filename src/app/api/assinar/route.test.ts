import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

// --- mocks -------------------------------------------------------------
//
// checarSlug, isValidCpfCnpj, stripDocumento e precoDoCiclo NÃO são
// mockados: são lógica pura (Task 8, Task 5, Task 2) e testá-las de novo
// aqui seria duplicar cobertura. O que a rota precisa isolar é I/O — banco e
// Asaas — que é o que os mocks abaixo cobrem.

const tenantFindUnique = vi.fn();
const inscricaoFindUnique = vi.fn();
const inscricaoCreate = vi.fn();
const inscricaoUpdate = vi.fn();
const inscricaoDelete = vi.fn();
const leadCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    tenant: {
      findUnique: (...args: unknown[]) => tenantFindUnique(...args),
    },
    inscricao: {
      findUnique: (...args: unknown[]) => inscricaoFindUnique(...args),
      create: (...args: unknown[]) => inscricaoCreate(...args),
      update: (...args: unknown[]) => inscricaoUpdate(...args),
      delete: (...args: unknown[]) => inscricaoDelete(...args),
    },
    lead: {
      create: (...args: unknown[]) => leadCreate(...args),
    },
  },
}));

const criarCliente = vi.fn();
const criarAssinatura = vi.fn();
const listarCobrancasDaAssinatura = vi.fn();

// Nenhum teste deste arquivo toca a API real do Asaas: o módulo inteiro é
// substituído por estas funções, e o comportamento de rede fica coberto pelos
// testes de src/lib/assinatura/asaas.test.ts (Task 6).
vi.mock("@/lib/assinatura/asaas", () => ({
  criarCliente: (...args: unknown[]) => criarCliente(...args),
  criarAssinatura: (...args: unknown[]) => criarAssinatura(...args),
  listarCobrancasDaAssinatura: (...args: unknown[]) =>
    listarCobrancasDaAssinatura(...args),
}));

const { POST } = await import("@/app/api/assinar/route");

// --- helpers -------------------------------------------------------------

// IP diferente por padrão a cada chamada: o limitador é módulo-escopo e
// sobrevive entre os testes deste arquivo. Com IP fixo, um teste tardio
// tomaria 429 por causa dos anteriores — por um motivo que nada tem a ver
// com o que ele afirma. Quem testa o 429 passa um IP fixo de propósito.
let contadorDeIp = 0;

function requisicao(
  body: unknown,
  { ip = `203.0.113.${++contadorDeIp}` } = {}
): NextRequest {
  return new NextRequest("http://localhost/api/assinar", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function corpoValido() {
  return {
    nome: "Pizzaria",
    email: "a@b.com",
    slug: "pizzaria",
    cpfCnpj: "11222333000181",
    plano: "MEMBRO",
    ciclo: "ANUAL",
    metodo: "PIX",
  };
}

// O erro que o Postgres devolve quando o slug @unique barra a segunda
// inscrição para o mesmo endereço. Classe de verdade, e não objeto solto com
// `code`: a rota testa com instanceof (mesmo raciocínio de
// provisionTenant em tenant-provisioning.ts), e um objeto solto passaria
// neste teste e falharia em produção.
function violacaoDeSlugUnico() {
  return new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed on the fields: (`slug`)",
    { code: "P2002", clientVersion: "6.19.3", meta: { target: ["slug"] } }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  tenantFindUnique.mockResolvedValue(null);
  inscricaoFindUnique.mockResolvedValue(null);
  inscricaoCreate.mockResolvedValue({ id: "insc-1" });
  inscricaoUpdate.mockResolvedValue({});
  inscricaoDelete.mockResolvedValue({});
  leadCreate.mockResolvedValue({ id: "lead-1" });
  criarCliente.mockResolvedValue({ id: "cus_123" });
  criarAssinatura.mockResolvedValue({ id: "sub_123" });
  listarCobrancasDaAssinatura.mockResolvedValue({
    data: [{ id: "pay_1", invoiceUrl: "https://sandbox.asaas.com/i/123" }],
  });
});

// --- testes ----------------------------------------------------------------

describe("POST /api/assinar", () => {
  it("recusa mensal em PIX — o Asaas não cobra PIX sozinho", async () => {
    const res = await POST(
      requisicao({
        nome: "Pizzaria",
        email: "a@b.com",
        slug: "pizzaria",
        cpfCnpj: "11222333000181",
        plano: "MEMBRO",
        ciclo: "MENSAL",
        metodo: "PIX",
      })
    );

    expect(res.status).toBe(400);
    expect(inscricaoCreate).not.toHaveBeenCalled();
  });

  it("o anual também vira assinatura, não cobrança avulsa", async () => {
    await POST(requisicao({ ...corpoValido(), ciclo: "ANUAL", metodo: "PIX" }));

    // Sem asaasSubscriptionId, o cron emitiria cobrança mensal para quem pagou
    // o ano inteiro e a régua bloquearia o cliente em 15 dias.
    expect(criarAssinatura).toHaveBeenCalledWith(
      expect.objectContaining({ ciclo: "ANUAL", billingType: "PIX" })
    );
    const dados = inscricaoUpdate.mock.calls[0][0].data;
    expect(dados.asaasSubscriptionId).toBeTruthy();
  });

  it("recusa slug já reservado por outra inscrição", async () => {
    inscricaoFindUnique.mockResolvedValue({ id: "insc-outra" });

    const res = await POST(requisicao(corpoValido()));

    expect(res.status).toBe(409);
    expect(criarCliente).not.toHaveBeenCalled();
    expect(inscricaoCreate).not.toHaveBeenCalled();
  });

  it("recusa slug já ocupado por um tenant existente", async () => {
    tenantFindUnique.mockResolvedValue({ id: "tenant-outro" });

    const res = await POST(requisicao(corpoValido()));

    expect(res.status).toBe(409);
    expect(criarCliente).not.toHaveBeenCalled();
    expect(inscricaoCreate).not.toHaveBeenCalled();
  });

  it("recusa slug fora do formato sem consultar o banco", async () => {
    const res = await POST(requisicao({ ...corpoValido(), slug: "Pizza Aqui!" }));

    expect(res.status).toBe(400);
    expect(tenantFindUnique).not.toHaveBeenCalled();
    expect(inscricaoFindUnique).not.toHaveBeenCalled();
  });

  it("recusa documento inválido antes de falar com o Asaas", async () => {
    const res = await POST(requisicao({ ...corpoValido(), cpfCnpj: "123" }));

    expect(res.status).toBe(400);
    expect(criarCliente).not.toHaveBeenCalled();
  });

  it("cria a inscrição e devolve a URL de pagamento", async () => {
    const res = await POST(requisicao(corpoValido()));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.checkoutUrl).toBe("https://sandbox.asaas.com/i/123");
    expect(inscricaoCreate).toHaveBeenCalled();
  });

  // O documento é o único dado sensível do formulário, e a regra do repo é
  // não persistir.
  it("não grava o documento na Inscricao", async () => {
    await POST(requisicao(corpoValido()));

    const dados = inscricaoCreate.mock.calls[0][0].data;
    expect(JSON.stringify(dados)).not.toContain("11222333000181");
  });

  // Mesma garantia acima, olhando também para o update pós-Asaas: o único
  // rastro do documento que pode sobrar em qualquer chamada ao Prisma é o
  // asaasCustomerId (um id do Asaas, não o CPF/CNPJ em si).
  it("não grava o documento em nenhuma chamada ao Prisma", async () => {
    await POST(requisicao(corpoValido()));

    const todasAsChamadas = [
      ...inscricaoCreate.mock.calls,
      ...inscricaoUpdate.mock.calls,
      ...leadCreate.mock.calls,
    ];
    for (const [args] of todasAsChamadas) {
      expect(JSON.stringify(args)).not.toContain("11222333000181");
    }
  });

  it("grava a Inscricao ANTES de chamar o Asaas — é ela que segura o slug", async () => {
    const ordem: string[] = [];
    inscricaoCreate.mockImplementation(async () => {
      ordem.push("inscricao.create");
      return { id: "insc-1" };
    });
    leadCreate.mockImplementation(async () => {
      ordem.push("lead.create");
      return { id: "lead-1" };
    });
    criarCliente.mockImplementation(async () => {
      ordem.push("asaas.criarCliente");
      return { id: "cus_123" };
    });

    await POST(requisicao(corpoValido()));

    // O Lead entra entre a Inscricao e o Asaas, não depois: um checkout que
    // já virou cobrança não pode depender do CRM para terminar (ver o
    // comentário na rota).
    expect(ordem).toEqual(["inscricao.create", "lead.create", "asaas.criarCliente"]);
  });

  it("perder a corrida contra outro create (P2002 no slug) devolve 409, não 500", async () => {
    // Entre o checarSlug e o create cabe outra requisição — READ COMMITTED
    // não impede. Quem perde a corrida bate no @unique do banco, e a rota
    // precisa traduzir o P2002 cru para o mesmo 409 do atalho, não deixar
    // vazar como erro interno.
    inscricaoCreate.mockRejectedValue(violacaoDeSlugUnico());

    const res = await POST(requisicao(corpoValido()));

    expect(res.status).toBe(409);
    expect(criarCliente).not.toHaveBeenCalled();
  });

  it("erro genérico no create (não P2002) não vira 409 disfarçado", async () => {
    // Uma queda de conexão não é "slug em uso" — se a rota devolvesse 409
    // aqui, o cliente tentaria outro nome de restaurante por um problema que
    // não tem nada a ver com o slug escolhido.
    inscricaoCreate.mockRejectedValue(new Error("conexão recusada"));

    const res = await POST(requisicao(corpoValido()));

    expect(res.status).not.toBe(409);
    expect(criarCliente).not.toHaveBeenCalled();
  });

  // A regra que separa os dois blocos abaixo: enquanto não existe nada
  // cobrável no Asaas, soltar o slug (apagar a Inscricao) é o desfecho
  // certo. A partir do instante em que a assinatura existe lá, a Inscricao
  // precisa sobreviver — é ela que o webhook usa para achar o pedido quando
  // o cliente pagar.
  it("criarCliente falha: nada cobrável existe ainda, a Inscricao é apagada", async () => {
    // Sem isso, um erro de rede prenderia o endereço até o cron passar, e o
    // cliente que tentasse de novo em seguida tomaria "indisponível" por
    // causa da própria tentativa anterior.
    criarCliente.mockRejectedValue(new Error("Asaas fora do ar"));

    const res = await POST(requisicao(corpoValido()));

    expect(res.status).toBe(502);
    expect(inscricaoDelete).toHaveBeenCalledWith({ where: { id: "insc-1" } });
    expect(inscricaoUpdate).not.toHaveBeenCalled();
  });

  it("criarAssinatura falha: ainda nada cobrável existe, a Inscricao é apagada", async () => {
    // Mesmo raciocínio do teste acima: o cliente no Asaas já existe, mas sem
    // assinatura não há nada que o webhook precise achar depois. Soltar o
    // slug continua sendo o desfecho certo aqui.
    criarAssinatura.mockRejectedValue(new Error("Asaas recusou o cartão"));

    const res = await POST(requisicao(corpoValido()));

    expect(res.status).toBe(502);
    expect(inscricaoDelete).toHaveBeenCalledWith({ where: { id: "insc-1" } });
    expect(inscricaoUpdate).not.toHaveBeenCalled();
  });

  it("criarAssinatura sucede e listarCobrancasDaAssinatura falha: Inscricao SOBREVIVE com os ids do Asaas gravados", async () => {
    // A partir daqui existe uma assinatura viva e cobrável no Asaas. Se a
    // rota apagasse a Inscricao agora (como fazia antes), e o cliente já
    // estivesse com a tela de pagamento aberta ou recebesse o e-mail de
    // cobrança do próprio Asaas, ele pagaria por uma assinatura que nenhuma
    // linha local aponta mais — o webhook não encontraria nada para casar
    // com o pagamento.
    listarCobrancasDaAssinatura.mockRejectedValue(new Error("Asaas indisponível"));

    const res = await POST(requisicao(corpoValido()));

    expect(res.status).toBe(502);
    expect(inscricaoDelete).not.toHaveBeenCalled();
    expect(inscricaoUpdate).toHaveBeenCalledWith({
      where: { id: "insc-1" },
      data: { asaasCustomerId: "cus_123", asaasSubscriptionId: "sub_123" },
    });
  });

  it("assinatura criada sem nenhuma cobrança: Inscricao SOBREVIVE com asaasSubscriptionId gravado", async () => {
    // Mesma fase da anterior (a assinatura já existe no Asaas quando isto
    // falha) — só que o erro vem de dentro de urlDaPrimeiraCobranca, não de
    // uma rejeição do listarCobrancasDaAssinatura em si.
    listarCobrancasDaAssinatura.mockResolvedValue({ data: [] });

    const res = await POST(requisicao(corpoValido()));

    expect(res.status).toBe(502);
    expect(inscricaoDelete).not.toHaveBeenCalled();
    expect(inscricaoUpdate).toHaveBeenCalledWith({
      where: { id: "insc-1" },
      data: { asaasCustomerId: "cus_123", asaasSubscriptionId: "sub_123" },
    });
  });

  it("inscricao.update falha depois da assinatura criada: Inscricao SOBREVIVE mesmo assim", async () => {
    // Pior caso: a assinatura existe no Asaas e nem os ids conseguiram ser
    // gravados. Mesmo assim não apagamos — apagar aqui seria o cenário
    // exato que o defeito descrevia: cobrança viva, zero linhas locais.
    inscricaoUpdate.mockRejectedValue(new Error("conexão com o banco caiu"));

    const res = await POST(requisicao(corpoValido()));

    expect(res.status).toBe(502);
    expect(inscricaoDelete).not.toHaveBeenCalled();
  });

  it("o log de falha carrega os ids do Asaas quando existem", async () => {
    // Quem lê o log às 2 da manhã precisa conseguir achar a assinatura no
    // painel do Asaas e a Inscricao no banco sem mais nenhuma pista.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    listarCobrancasDaAssinatura.mockRejectedValue(new Error("Asaas indisponível"));

    await POST(requisicao(corpoValido()));

    const mensagens = spy.mock.calls.map((args) => args.join(" "));
    expect(
      mensagens.some(
        (m) => m.includes("insc-1") && m.includes("cus_123") && m.includes("sub_123")
      )
    ).toBe(true);

    spy.mockRestore();
  });

  it("se o próprio delete de recuperação falhar, o erro é logado — não pode sumir em silêncio", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    criarCliente.mockRejectedValue(new Error("Asaas fora do ar"));
    inscricaoDelete.mockRejectedValue(new Error("banco fora do ar também"));

    const res = await POST(requisicao(corpoValido()));

    expect(res.status).toBe(502);
    const mensagens = spy.mock.calls.map((args) => args.join(" "));
    expect(mensagens.some((m) => m.includes("banco fora do ar também"))).toBe(true);

    spy.mockRestore();
  });

  it("expiraEm reserva 1h para cartão", async () => {
    const antes = Date.now();
    await POST(requisicao({ ...corpoValido(), metodo: "CREDIT_CARD", ciclo: "ANUAL" }));

    const expira = inscricaoCreate.mock.calls[0][0].data.expiraEm as Date;
    const deltaMs = expira.getTime() - antes;
    expect(deltaMs).toBeGreaterThan(55 * 60 * 1000);
    expect(deltaMs).toBeLessThanOrEqual(60 * 60 * 1000 + 5000);
  });

  it("expiraEm reserva 24h para PIX — trocar os dois valores por engano não seria pego sem este teste", async () => {
    const antes = Date.now();
    await POST(requisicao({ ...corpoValido(), metodo: "PIX", ciclo: "ANUAL" }));

    const expira = inscricaoCreate.mock.calls[0][0].data.expiraEm as Date;
    const deltaMs = expira.getTime() - antes;
    expect(deltaMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(deltaMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 5000);
  });

  it("registra o Lead da inscrição para não sumir do funil", async () => {
    await POST(requisicao(corpoValido()));

    expect(leadCreate).toHaveBeenCalledTimes(1);
    expect(leadCreate.mock.calls[0][0].data).toMatchObject({
      restaurante: "Pizzaria",
      email: "a@b.com",
      origem: "checkout",
      status: "NEGOCIACAO",
    });
  });

  it("Lead falhando não derruba o checkout — nem o 201, nem a assinatura no Asaas", async () => {
    // Registro de CRM não pode ter poder de veto sobre um checkout que já
    // virou cobrança. Se isto voltasse a lançar (em vez de logar e seguir),
    // o teste abaixo capturaria a rejeição e falharia — é a prova de que o
    // try/catch do Lead é realmente não-fatal.
    leadCreate.mockRejectedValue(new Error("constraint qualquer no Lead"));

    const res = await POST(requisicao(corpoValido()));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.checkoutUrl).toBe("https://sandbox.asaas.com/i/123");
    expect(criarAssinatura).toHaveBeenCalledTimes(1);
  });

  it("Asaas falha depois do Lead gravado: a Inscricao é apagada, mas o Lead sobrevive", async () => {
    // O abandono precisa ficar registrado: é justamente o que um Lead deve
    // contar quando alguém tenta assinar e a cobrança não sai do chão. Se o
    // Lead fosse desfeito junto com a Inscricao, esse dado de funil se
    // perderia sem deixar rastro.
    criarCliente.mockRejectedValue(new Error("Asaas fora do ar"));

    const res = await POST(requisicao(corpoValido()));

    expect(res.status).toBe(502);
    expect(inscricaoDelete).toHaveBeenCalledWith({ where: { id: "insc-1" } });
    expect(leadCreate).toHaveBeenCalledTimes(1);
  });

  it("barra com 429 ao estourar o teto do mesmo IP", async () => {
    const ip = "198.51.100.9";
    for (let i = 0; i < 5; i++) {
      const ok = await POST(requisicao(corpoValido(), { ip }));
      expect(ok.status).toBe(201);
    }

    const barrado = await POST(requisicao(corpoValido(), { ip }));
    expect(barrado.status).toBe(429);
  });
});
