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
const inscricaoFindMany = vi.fn();
const temPagamentoConfirmado = vi.fn();
const reconciliar = vi.fn();

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
      findMany: (...args: unknown[]) => inscricaoFindMany(...args),
    },
  },
}));

// A faxina consulta o Asaas antes de apagar. Mockado porque é I/O; a decisão
// de o que fazer com cada resposta é o que estes testes exercitam.
vi.mock("@/lib/assinatura/reconciliacao", () => ({
  reconciliarInscricoesPagas: (...args: unknown[]) => reconciliar(...args),
}));

vi.mock("@/lib/assinatura/asaas", () => ({
  assinaturaTemPagamentoConfirmado: (...args: unknown[]) =>
    temPagamentoConfirmado(...args),
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
  inscricaoFindMany.mockResolvedValue([]);
  temPagamentoConfirmado.mockResolvedValue(false);
  reconciliar.mockResolvedValue({ candidatas: 0, provisionadas: 0, falhas: 0 });
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
  function candidata(overrides: Record<string, unknown> = {}) {
    return {
      id: "insc-vencida",
      slug: "pizzaria-abandonada",
      asaasSubscriptionId: "sub_vencida",
      ...overrides,
    };
  }

  it("procura apenas inscrição AGUARDANDO_PAGAMENTO e vencida", async () => {
    await POST(requisicao());

    expect(inscricaoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "AGUARDANDO_PAGAMENTO",
          expiraEm: { lt: expect.any(Date) },
        },
      })
    );
  });

  it("apaga a que venceu sem pagamento, soltando o slug", async () => {
    inscricaoFindMany.mockResolvedValue([candidata()]);
    inscricaoDeleteMany.mockResolvedValue({ count: 1 });

    await POST(requisicao());

    expect(temPagamentoConfirmado).toHaveBeenCalledWith("sub_vencida");
    expect(inscricaoDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["insc-vencida"] } },
    });
  });

  // O CASO QUE ESTE BLOCO EXISTE PARA IMPEDIR. Cliente paga, o webhook
  // atrasa (fila do Asaas interrompida, deploy caindo), passa o expiraEm, e
  // a faxina apaga a linha. Os três campos que ligam aquele pagamento a
  // alguém — externalReference, asaasPaymentId, asaasSubscriptionId — moram
  // nessa linha: apagada, o webhook que chegar depois não casa com nada e o
  // handler responde 200. O cliente segue sendo cobrado todo mês, sem
  // restaurante e sem rastro.
  it("NÃO apaga inscrição vencida cujo pagamento o Asaas confirma", async () => {
    inscricaoFindMany.mockResolvedValue([candidata()]);
    temPagamentoConfirmado.mockResolvedValue(true);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await POST(requisicao());

    expect(inscricaoDeleteMany).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("insc-vencida")
    );

    consoleErrorSpy.mockRestore();
  });

  // Sem id de assinatura não há o que perguntar: a inscrição morreu antes de
  // o Asaas existir para ela, então não há pagamento possível. Apagar direto
  // evita uma chamada de rede por linha abandonada.
  it("apaga sem consultar o Asaas quando não há asaasSubscriptionId", async () => {
    inscricaoFindMany.mockResolvedValue([candidata({ asaasSubscriptionId: null })]);
    inscricaoDeleteMany.mockResolvedValue({ count: 1 });

    await POST(requisicao());

    expect(temPagamentoConfirmado).not.toHaveBeenCalled();
    expect(inscricaoDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["insc-vencida"] } },
    });
  });

  // Dúvida não vira exclusão, e uma linha problemática não pode travar a
  // faxina inteira: a que falhou fica para a próxima passada, as outras
  // seguem.
  it("Asaas fora do ar preserva aquela inscrição, sem impedir as demais", async () => {
    inscricaoFindMany.mockResolvedValue([
      candidata({ id: "insc-erro", asaasSubscriptionId: "sub_erro" }),
      candidata({ id: "insc-ok", asaasSubscriptionId: "sub_ok" }),
    ]);
    temPagamentoConfirmado.mockImplementation(async (sub: string) => {
      if (sub === "sub_erro") throw new Error("Asaas respondeu 500");
      return false;
    });
    inscricaoDeleteMany.mockResolvedValue({ count: 1 });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await POST(requisicao());

    expect(inscricaoDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["insc-ok"] } },
    });

    consoleErrorSpy.mockRestore();
  });

  it("não chama o banco para apagar quando nenhuma candidata sobrou", async () => {
    inscricaoFindMany.mockResolvedValue([candidata()]);
    temPagamentoConfirmado.mockResolvedValue(true);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await POST(requisicao());

    expect(inscricaoDeleteMany).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("inclui a contagem de inscrições apagadas na resposta do job", async () => {
    inscricaoFindMany.mockResolvedValue([candidata()]);
    inscricaoDeleteMany.mockResolvedValue({ count: 3 });

    const res = await POST(requisicao());

    expect(await res.json()).toMatchObject({ inscricoesExpiradas: 3 });
  });

  it("não apaga inscrição quando o segredo está errado", async () => {
    await POST(requisicao({ secret: "errado" }));

    expect(inscricaoFindMany).not.toHaveBeenCalled();
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
    inscricaoFindMany.mockResolvedValue([candidata()]);
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
    inscricaoFindMany.mockResolvedValue([candidata()]);
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

describe("POST /api/cron/assinaturas — reconciliação", () => {
  it("reconcilia inscrições pagas e devolve o resultado na resposta do job", async () => {
    reconciliar.mockResolvedValue({ candidatas: 3, provisionadas: 1, falhas: 0 });

    const res = await POST(requisicao());

    expect(reconciliar).toHaveBeenCalledTimes(1);
    expect(await res.json()).toMatchObject({
      reconciliacao: { candidatas: 3, provisionadas: 1, falhas: 0 },
    });
  });

  // A ordem não é detalhe: reconciliar ANTES tira da frente da faxina quem
  // pagou e estava esperando. Se a faxina rodasse primeiro, ela veria uma
  // inscrição vencida e paga, precisaria consultar o Asaas para não apagá-la,
  // e a reconciliação consultaria de novo logo depois — duas chamadas para a
  // mesma pergunta, e uma janela entre elas.
  it("reconcilia antes de apagar inscrição vencida", async () => {
    const ordem: string[] = [];
    reconciliar.mockImplementation(async () => {
      ordem.push("reconciliacao");
      return { candidatas: 0, provisionadas: 0, falhas: 0 };
    });
    inscricaoFindMany.mockImplementation(async () => {
      ordem.push("faxina");
      return [];
    });

    await POST(requisicao());

    expect(ordem).toEqual(["reconciliacao", "faxina"]);
  });

  // Mesma regra que já governa a faxina: conveniência não derruba receita. Um
  // erro na reconciliação não pode fazer o job sair sem gerar a fatura de
  // ninguém.
  it("cobrança do mês acontece mesmo se a reconciliação falhar", async () => {
    assinaturaFindMany.mockResolvedValue([assinatura()]);
    reconciliar.mockRejectedValue(new Error("Asaas fora do ar"));

    const res = await POST(requisicao());

    expect(res.status).toBe(200);
    expect(cobrancaCreate).toHaveBeenCalledTimes(1);
    expect(await res.json()).toMatchObject({ reconciliacaoFalhou: true });
  });

  it("não reconcilia quando o segredo está errado", async () => {
    await POST(requisicao({ secret: "errado" }));

    expect(reconciliar).not.toHaveBeenCalled();
  });
});
