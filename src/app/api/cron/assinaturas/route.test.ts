import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const SEGREDO = "segredo-do-cron";

// Dia 20 de agosto: já passou o vencimento 10 de todas as assinaturas dos
// casos abaixo, então a régua tem o que medir sem precisar de data mágica.
const HOJE = new Date("2026-08-20T09:00:00Z");

// --- mocks -----------------------------------------------------------------

const assinaturaFindMany = vi.fn();
const assinaturaUpdate = vi.fn();
const cobrancaCreate = vi.fn();
const cobrancaFindMany = vi.fn();
const inscricaoDeleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    assinatura: {
      findMany: (...args: unknown[]) => assinaturaFindMany(...args),
      update: (...args: unknown[]) => assinaturaUpdate(...args),
    },
    cobranca: {
      create: (...args: unknown[]) => cobrancaCreate(...args),
      findMany: (...args: unknown[]) => cobrancaFindMany(...args),
    },
    inscricao: {
      deleteMany: (...args: unknown[]) => inscricaoDeleteMany(...args),
    },
  },
}));

const { GET, POST } = await import("@/app/api/cron/assinaturas/route");

// --- helpers ---------------------------------------------------------------

function requisicao({ secret }: { secret?: string | null } = {}): NextRequest {
  const headers: Record<string, string> = {};
  const valor = secret === undefined ? SEGREDO : secret;
  if (valor !== null) headers.authorization = `Bearer ${valor}`;
  return new NextRequest("http://localhost/api/cron/assinaturas", {
    method: "POST",
    headers,
  });
}

function assinatura(sobrescreve: Record<string, unknown> = {}) {
  return {
    id: "assin-1",
    valorMensal: new Prisma.Decimal("199.90"),
    diaVencimento: 10,
    // Cortesia já vencida há meses: o padrão dos casos é "cobra".
    inicioCobranca: new Date("2026-01-10T00:00:00Z"),
    status: "ATIVA",
    // Padrão: cliente cobrado por PIX conferido na mão, sem gateway. Os
    // testes da Task 4 sobrescrevem isso para simular quem o Asaas cobra.
    asaasSubscriptionId: null,
    ...sobrescreve,
  };
}

// O erro que o Postgres devolve quando o unique (assinaturaId, competencia)
// barra a segunda cobrança do mesmo mês. Classe de verdade, e não objeto com
// `code`: a rota testa com instanceof, e um objeto solto passaria pelo teste
// e falharia em produção.
function violacaoDeUnique() {
  return new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed on the fields: (`assinaturaId`,`competencia`)",
    {
      code: "P2002",
      clientVersion: "6.19.3",
      meta: { target: ["assinaturaId", "competencia"] },
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Só o relógio: mexer em setTimeout/queueMicrotask trava o await da rota.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(HOJE);
  process.env.CRON_SECRET = SEGREDO;
  assinaturaFindMany.mockResolvedValue([]);
  assinaturaUpdate.mockResolvedValue({});
  cobrancaCreate.mockResolvedValue({ id: "cob-nova" });
  cobrancaFindMany.mockResolvedValue([]);
  inscricaoDeleteMany.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

// --- testes ----------------------------------------------------------------

describe("POST /api/cron/assinaturas — autorização", () => {
  it("recusa sem o CRON_SECRET", async () => {
    const res = await POST(requisicao({ secret: "errado" }));

    expect(res.status).toBe(401);
    expect(assinaturaFindMany).not.toHaveBeenCalled();
    expect(cobrancaCreate).not.toHaveBeenCalled();
    expect(assinaturaUpdate).not.toHaveBeenCalled();
  });

  it("recusa sem cabeçalho nenhum", async () => {
    const res = await POST(requisicao({ secret: null }));

    expect(res.status).toBe(401);
    expect(cobrancaCreate).not.toHaveBeenCalled();
  });

  it("recusa quando CRON_SECRET não está configurado", async () => {
    // Sem esta guarda, um ambiente sem a variável compararia o header com
    // "Bearer undefined" — e quem mandasse essa string abriria o job.
    delete process.env.CRON_SECRET;

    const res = await POST(requisicao({ secret: "undefined" }));

    expect(res.status).toBe(401);
    expect(cobrancaCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/cron/assinaturas — geração da cobrança", () => {
  it("gera cobrança do mês para assinatura cuja cortesia já passou", async () => {
    const a = assinatura();
    assinaturaFindMany.mockResolvedValue([a]);

    const res = await POST(requisicao());

    expect(res.status).toBe(200);
    expect(cobrancaCreate).toHaveBeenCalledTimes(1);
    expect(cobrancaCreate.mock.calls[0][0].data).toMatchObject({
      assinaturaId: "assin-1",
      competencia: "2026-08",
      valor: a.valorMensal,
      vencimento: new Date("2026-08-10T00:00:00Z"),
    });
  });

  it("não gera para assinatura ainda em cortesia", async () => {
    // inicioCobranca no futuro: a assinatura existe, aparece nas telas, e não
    // cobra. Sem esta checagem, a cortesia negociada caso a caso seria
    // cobrada no primeiro dia.
    assinaturaFindMany.mockResolvedValue([
      assinatura({ inicioCobranca: new Date("2026-09-10T00:00:00Z") }),
    ]);

    const res = await POST(requisicao());

    expect(res.status).toBe(200);
    expect(cobrancaCreate).not.toHaveBeenCalled();
  });

  it("cobra no dia em que a cortesia termina", async () => {
    // A fronteira: inicioCobranca hoje é cortesia acabada, não cortesia.
    assinaturaFindMany.mockResolvedValue([
      assinatura({ inicioCobranca: new Date("2026-08-20T00:00:00Z") }),
    ]);

    await POST(requisicao());

    expect(cobrancaCreate).toHaveBeenCalledTimes(1);
  });

  it("não gera para assinatura CANCELADA", async () => {
    assinaturaFindMany.mockResolvedValue([assinatura({ status: "CANCELADA" })]);

    const res = await POST(requisicao());

    expect(res.status).toBe(200);
    expect(cobrancaCreate).not.toHaveBeenCalled();
  });

  it("nem busca assinatura CANCELADA no banco", async () => {
    await POST(requisicao());

    expect(assinaturaFindMany.mock.calls[0][0].where).toMatchObject({
      status: { not: "CANCELADA" },
    });
  });

  it("rodar duas vezes não duplica cobrança", async () => {
    assinaturaFindMany.mockResolvedValue([assinatura()]);
    cobrancaCreate.mockResolvedValueOnce({ id: "cob-nova" });
    cobrancaCreate.mockRejectedValueOnce(violacaoDeUnique());

    const primeira = await POST(requisicao());
    const segunda = await POST(requisicao());

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(await primeira.json()).toMatchObject({ cobrancasCriadas: 1 });
    expect(await segunda.json()).toMatchObject({
      cobrancasCriadas: 0,
      cobrancasJaExistentes: 1,
    });
  });

  it("não engole erro de banco que não seja o unique", async () => {
    // P2002 é desfecho esperado; conexão recusada não é. Tratar todo erro como
    // "já existe" faria o mês inteiro passar sem cobrança nenhuma, com 200 na
    // resposta e ninguém sabendo.
    assinaturaFindMany.mockResolvedValue([assinatura()]);
    cobrancaCreate.mockRejectedValue(new Error("conexão recusada"));

    await expect(POST(requisicao())).rejects.toThrow("conexão recusada");
  });
});

describe("assinatura cobrada pelo gateway", () => {
  // Dois relógios para a mesma dívida é o defeito que este teste tranca: o
  // Asaas cobra o cartão, o cron cria a cobrança do mês assim mesmo, ninguém
  // dá baixa, e em 15 dias a régua bloqueia um restaurante adimplente.
  it("não gera cobrança quando há asaasSubscriptionId", async () => {
    assinaturaFindMany.mockResolvedValue([
      assinatura({ id: "assin-gateway", asaasSubscriptionId: "sub_123" }),
    ]);

    const res = await POST(requisicao());

    expect(res.status).toBe(200);
    expect(cobrancaCreate).not.toHaveBeenCalled();
  });

  it("continua gerando para quem não tem gateway", async () => {
    assinaturaFindMany.mockResolvedValue([
      assinatura({ id: "assin-pix", asaasSubscriptionId: null }),
    ]);

    await POST(requisicao());

    expect(cobrancaCreate).toHaveBeenCalledTimes(1);
  });

  // A metade da trava que ninguém lembra de testar: pular a criação da
  // cobrança não pode pular o recálculo de status também. Cartão que falha
  // vira cobrança vencida pelo webhook, e é essa cobrança que precisa
  // continuar bloqueando pelo caminho de sempre — senão o cliente de gateway
  // inadimplente nunca é bloqueado.
  it("a régua continua rodando e bloqueia a assinatura de gateway inadimplente", async () => {
    assinaturaFindMany.mockResolvedValue([
      assinatura({
        id: "assin-gateway",
        status: "INADIMPLENTE",
        asaasSubscriptionId: "sub_123",
      }),
    ]);
    // Cobrança vencida há 15 dias, como o webhook do Asaas teria espelhado
    // após o cartão falhar.
    cobrancaFindMany.mockResolvedValue([
      { assinaturaId: "assin-gateway", vencimento: new Date("2026-08-05T00:00:00Z") },
    ]);

    await POST(requisicao());

    expect(cobrancaCreate).not.toHaveBeenCalled();
    expect(assinaturaUpdate).toHaveBeenCalledTimes(1);
    expect(assinaturaUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "assin-gateway" },
      data: { status: "BLOQUEADA" },
    });
  });
});

describe("POST /api/cron/assinaturas — a régua", () => {
  it("move status pela régua e persiste", async () => {
    assinaturaFindMany.mockResolvedValue([assinatura({ status: "ATIVA" })]);
    // Vencida em 10/08, hoje 20/08: 10 dias de atraso, faixa do aviso.
    cobrancaFindMany.mockResolvedValue([
      { assinaturaId: "assin-1", vencimento: new Date("2026-08-10T00:00:00Z") },
    ]);

    const res = await POST(requisicao());

    expect(res.status).toBe(200);
    expect(assinaturaUpdate).toHaveBeenCalledTimes(1);
    expect(assinaturaUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "assin-1" },
      data: { status: "INADIMPLENTE" },
    });
  });

  it("bloqueia quando o atraso passa da segunda faixa", async () => {
    assinaturaFindMany.mockResolvedValue([
      assinatura({ status: "INADIMPLENTE" }),
    ]);
    cobrancaFindMany.mockResolvedValue([
      { assinaturaId: "assin-1", vencimento: new Date("2026-08-05T00:00:00Z") },
    ]);

    await POST(requisicao());

    expect(assinaturaUpdate.mock.calls[0][0].data).toMatchObject({
      status: "BLOQUEADA",
    });
  });

  it("volta para ATIVA quando não há mais cobrança em aberto", async () => {
    // O caminho do pagamento: quem quitou tem de voltar sozinho, senão a
    // baixa de uma fatura viraria trabalho manual.
    assinaturaFindMany.mockResolvedValue([assinatura({ status: "BLOQUEADA" })]);
    cobrancaFindMany.mockResolvedValue([]);

    await POST(requisicao());

    expect(assinaturaUpdate.mock.calls[0][0].data).toMatchObject({
      status: "ATIVA",
    });
  });

  it("mede pela cobrança em aberto mais antiga", async () => {
    // Duas em aberto: quem manda é a mais velha. Pela mais nova, quem deve
    // três meses apareceria como em dia.
    assinaturaFindMany.mockResolvedValue([assinatura({ status: "ATIVA" })]);
    cobrancaFindMany.mockResolvedValue([
      { assinaturaId: "assin-1", vencimento: new Date("2026-06-10T00:00:00Z") },
      { assinaturaId: "assin-1", vencimento: new Date("2026-08-10T00:00:00Z") },
    ]);

    await POST(requisicao());

    expect(assinaturaUpdate.mock.calls[0][0].data).toMatchObject({
      status: "BLOQUEADA",
    });
  });

  it("só olha cobrança em aberto — PAGA não conta", async () => {
    await POST(requisicao());

    expect(cobrancaFindMany.mock.calls[0][0].where).toMatchObject({
      status: { in: ["PENDENTE", "VENCIDA"] },
    });
  });

  it("não escreve quando o status já é o que a régua diz", async () => {
    assinaturaFindMany.mockResolvedValue([assinatura({ status: "ATIVA" })]);
    cobrancaFindMany.mockResolvedValue([]);

    const res = await POST(requisicao());

    expect(assinaturaUpdate).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ statusAtualizados: 0 });
  });

  it("nunca move assinatura CANCELADA", async () => {
    // Cancelamento é decisão humana. Mesmo com fatura vencida há meses, o job
    // não pode reescrever isso para BLOQUEADA — nem para ATIVA.
    assinaturaFindMany.mockResolvedValue([assinatura({ status: "CANCELADA" })]);
    cobrancaFindMany.mockResolvedValue([
      { assinaturaId: "assin-1", vencimento: new Date("2026-05-10T00:00:00Z") },
    ]);

    await POST(requisicao());

    expect(assinaturaUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /api/cron/assinaturas — limpeza de inscrição vencida", () => {
  it("apaga inscrição não paga e vencida, soltando o slug", async () => {
    await POST(requisicao());

    expect(inscricaoDeleteMany).toHaveBeenCalledWith({
      where: {
        status: "AGUARDANDO_PAGAMENTO",
        expiraEm: { lt: expect.any(Date) },
      },
    });
  });

  // Inscrição paga esperando o webhook não pode ser apagada junto: o slug
  // dela está reservado com razão. E a já provisionada virou restaurante —
  // não é mais uma reserva de slug, é o próprio tenant.
  it("não apaga inscrição já paga nem já provisionada", async () => {
    await POST(requisicao());

    const { where } = inscricaoDeleteMany.mock.calls[0][0];
    expect(where.status).toBe("AGUARDANDO_PAGAMENTO");
  });

  it("inclui a contagem de inscrições apagadas na resposta do job", async () => {
    inscricaoDeleteMany.mockResolvedValue({ count: 3 });

    const res = await POST(requisicao());

    expect(await res.json()).toMatchObject({ inscricoesExpiradas: 3 });
  });

  it("não apaga inscrição quando o segredo está errado", async () => {
    await POST(requisicao({ secret: "errado" }));

    expect(inscricaoDeleteMany).not.toHaveBeenCalled();
  });

  // A REGRA: soltar slug abandonado é conveniência; gerar a cobrança do mês e
  // mover a régua é receita. Um blip de conexão na faxina não pode derrubar a
  // cobrança de todos os clientes — por isso a limpeza roda por último e não
  // propaga.
  it("cobrança e régua rodam mesmo quando a limpeza de inscrição falha", async () => {
    assinaturaFindMany.mockResolvedValue([assinatura({ status: "ATIVA" })]);
    cobrancaFindMany.mockResolvedValue([
      { assinaturaId: "assin-1", vencimento: new Date("2026-08-10T00:00:00Z") },
    ]);
    inscricaoDeleteMany.mockRejectedValue(new Error("conexão recusada"));

    const res = await POST(requisicao());

    expect(res.status).toBe(200);
    expect(cobrancaCreate).toHaveBeenCalledTimes(1);
    expect(assinaturaUpdate).toHaveBeenCalledTimes(1);
    expect(assinaturaUpdate.mock.calls[0][0].data).toMatchObject({
      status: "INADIMPLENTE",
    });
  });

  // Contador honesto: se a faxina falhou, não sabemos quantas inscrições
  // seriam apagadas — inventar um número aqui esconderia o problema em vez
  // de sinalizá-lo.
  it("não inventa contagem quando a limpeza falha, e sinaliza a falha na resposta", async () => {
    inscricaoDeleteMany.mockRejectedValue(new Error("timeout"));

    const res = await POST(requisicao());

    expect(await res.json()).toMatchObject({
      inscricoesExpiradas: 0,
      limpezaDeInscricoesFalhou: true,
    });
  });
});

describe("GET /api/cron/assinaturas", () => {
  it("responde ao GET, que é como a Vercel dispara o cron", async () => {
    // A Vercel chama o path com GET. Exportar só POST daria 405 todo dia às
    // 9h UTC, sem ninguém perceber até a primeira cobrança faltar.
    assinaturaFindMany.mockResolvedValue([assinatura()]);

    const res = await GET(requisicao());

    expect(res.status).toBe(200);
    expect(cobrancaCreate).toHaveBeenCalledTimes(1);
  });

  it("o GET também exige o segredo", async () => {
    const res = await GET(requisicao({ secret: "errado" }));

    expect(res.status).toBe(401);
    expect(cobrancaCreate).not.toHaveBeenCalled();
  });
});
