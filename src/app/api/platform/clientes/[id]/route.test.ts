import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- mocks -----------------------------------------------------------------

const authPlatform = vi.fn();
vi.mock("@/lib/auth-platform", () => ({ authPlatform: () => authPlatform() }));

const assinaturaFindUnique = vi.fn();
const assinaturaCreate = vi.fn();
const assinaturaUpdate = vi.fn();
const tenantFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    assinatura: {
      findUnique: (...a: unknown[]) => assinaturaFindUnique(...a),
      create: (...a: unknown[]) => assinaturaCreate(...a),
      update: (...a: unknown[]) => assinaturaUpdate(...a),
    },
    tenant: { findUnique: (...a: unknown[]) => tenantFindUnique(...a) },
  },
}));

const cancelarNoAsaas = vi.fn();
const atualizarValorNoAsaas = vi.fn();
vi.mock("@/lib/assinatura/asaas", () => ({
  cancelarAssinaturaNoAsaas: (...a: unknown[]) => cancelarNoAsaas(...a),
  atualizarValorDaAssinatura: (...a: unknown[]) => atualizarValorNoAsaas(...a),
}));

const { PATCH } = await import("@/app/api/platform/clientes/[id]/route");

// --- helpers ---------------------------------------------------------------

function requisicao(body: unknown): NextRequest {
  return new NextRequest("http://admin.localhost/api/platform/clientes/t1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "t1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  authPlatform.mockResolvedValue({ user: { id: "admin-1" } });
  tenantFindUnique.mockResolvedValue({ id: "t1" });
  assinaturaCreate.mockImplementation(async (a: { data: unknown }) => a.data);
  assinaturaUpdate.mockImplementation(async (a: { data: unknown }) => a.data);
  cancelarNoAsaas.mockResolvedValue(undefined);
  atualizarValorNoAsaas.mockResolvedValue(undefined);
});

// --- testes ----------------------------------------------------------------

/**
 * Esta rota é o TERCEIRO caminho que cria assinatura, e foi o último a receber
 * a correção do inicioCobranca no passado — o backfill da migração e a
 * conversão de lead já a tinham. O defeito é silencioso e caro: o cliente
 * nasce vencido, o job diário gera a cobrança, e a régua o bloqueia em duas
 * semanas por uma fatura que ninguém enviou.
 *
 * Só reproduz em parte do mês: com vencimento dia 25 e hoje dia 20 a data cai
 * no futuro por acaso, e o bug some. Por isso o teste varre os 28 dias.
 */
describe("PATCH /api/platform/clientes/[id] — inicioCobranca nunca no passado", () => {
  it("ao criar assinatura, qualquer dia de vencimento gera data futura", async () => {
    for (let dia = 1; dia <= 28; dia++) {
      assinaturaFindUnique.mockResolvedValue(null);
      const antes = Date.now();

      await PATCH(requisicao({ valorMensal: 99.9, diaVencimento: dia }), params);

      const criada = assinaturaCreate.mock.calls.at(-1)![0].data;
      expect(
        criada.inicioCobranca.getTime(),
        `vencimento dia ${dia} nasceu no passado`
      ).toBeGreaterThan(antes);
    }
  });

  it("ao reativar uma cancelada, recomeça o relógio", async () => {
    // Assinatura cancelada meses atrás: o inicioCobranca antigo já passou.
    // Voltar para ATIVA sem mexer nele faria o job cobrar retroativo —
    // recontratado hoje, inadimplente amanhã.
    assinaturaFindUnique.mockResolvedValue({
      status: "CANCELADA",
      diaVencimento: 10,
      inicioCobranca: new Date("2025-01-10T00:00:00Z"),
    });
    const antes = Date.now();

    await PATCH(requisicao({ valorMensal: 120 }), params);

    const dados = assinaturaUpdate.mock.calls.at(-1)![0].data;
    expect(dados.status).toBe("ATIVA");
    expect(dados.inicioCobranca.getTime()).toBeGreaterThan(antes);
  });

  it("não mexe no inicioCobranca de quem não estava cancelado", async () => {
    // INADIMPLENTE e BLOQUEADA são da régua. Reiniciar o relógio aqui apagaria
    // um atraso que ninguém pagou.
    assinaturaFindUnique.mockResolvedValue({
      status: "INADIMPLENTE",
      diaVencimento: 10,
      inicioCobranca: new Date("2026-01-10T00:00:00Z"),
    });

    await PATCH(requisicao({ valorMensal: 120 }), params);

    const dados = assinaturaUpdate.mock.calls.at(-1)![0].data;
    expect(dados).not.toHaveProperty("inicioCobranca");
    expect(dados).not.toHaveProperty("status");
  });

  it("recusa sem sessão de plataforma", async () => {
    authPlatform.mockResolvedValue(null);

    const res = await PATCH(requisicao({ valorMensal: 99.9 }), params);

    expect(res.status).toBe(401);
    expect(assinaturaCreate).not.toHaveBeenCalled();
    expect(assinaturaUpdate).not.toHaveBeenCalled();
  });
});


/**
 * Cancelar ou mudar o valor no CRM só alterava o banco local: o Asaas seguia
 * cobrando o cartão do cliente. Agora o gateway vai primeiro, e se ele falhar
 * a rota falha, em vez de gravar um estado que não aconteceu.
 */
describe("PATCH /api/platform/clientes/[id]: propaga ao Asaas", () => {
  const doGateway = (extra: Record<string, unknown> = {}) => ({
    id: "a1",
    tenantId: "t1",
    status: "ATIVA",
    valorMensal: 99.99,
    diaVencimento: 10,
    ciclo: "MENSAL",
    asaasSubscriptionId: "sub_1",
    ...extra,
  });

  it("apagar a mensalidade cancela a assinatura no Asaas antes de gravar CANCELADA", async () => {
    assinaturaFindUnique.mockResolvedValue(doGateway());

    await PATCH(requisicao({ valorMensal: null }), params);

    expect(cancelarNoAsaas).toHaveBeenCalledWith("sub_1");
    expect(assinaturaUpdate).toHaveBeenCalledWith({
      where: { tenantId: "t1" },
      data: { status: "CANCELADA" },
    });
    expect(cancelarNoAsaas.mock.invocationCallOrder[0]).toBeLessThan(
      assinaturaUpdate.mock.invocationCallOrder[0]
    );
  });

  it("se o Asaas recusar o cancelamento, nada é gravado e a resposta é 502", async () => {
    assinaturaFindUnique.mockResolvedValue(doGateway());
    cancelarNoAsaas.mockRejectedValue(new Error("Asaas fora do ar"));

    const res = await PATCH(requisicao({ valorMensal: null }), params);

    expect(res.status).toBe(502);
    expect(assinaturaUpdate).not.toHaveBeenCalled();
  });

  it("cliente sem assinatura no gateway (PIX conferido à mão) não chama o Asaas", async () => {
    assinaturaFindUnique.mockResolvedValue(doGateway({ asaasSubscriptionId: null }));

    await PATCH(requisicao({ valorMensal: null }), params);

    expect(cancelarNoAsaas).not.toHaveBeenCalled();
    expect(assinaturaUpdate).toHaveBeenCalled();
  });

  it("mudar o valor mensal atualiza o Asaas", async () => {
    assinaturaFindUnique.mockResolvedValue(doGateway());

    await PATCH(requisicao({ valorMensal: 129.9 }), params);

    expect(atualizarValorNoAsaas).toHaveBeenCalledWith("sub_1", 129.9);
    expect(assinaturaUpdate).toHaveBeenCalled();
  });

  it("valor igual ao atual não chama o gateway", async () => {
    assinaturaFindUnique.mockResolvedValue(doGateway());
    await PATCH(requisicao({ valorMensal: 99.99 }), params);
    expect(atualizarValorNoAsaas).not.toHaveBeenCalled();
  });

  it("plano anual: o valor do Asaas é o do ano, então a mudança tem que ser feita lá (409)", async () => {
    assinaturaFindUnique.mockResolvedValue(doGateway({ ciclo: "ANUAL" }));

    const res = await PATCH(requisicao({ valorMensal: 129.9 }), params);

    expect(res.status).toBe(409);
    expect(atualizarValorNoAsaas).not.toHaveBeenCalled();
    expect(assinaturaUpdate).not.toHaveBeenCalled();
  });

  it("mudar o dia de vencimento de assinatura do gateway é 409: o Asaas decide a data da próxima cobrança", async () => {
    assinaturaFindUnique.mockResolvedValue(doGateway());

    const res = await PATCH(requisicao({ diaVencimento: 20 }), params);

    expect(res.status).toBe(409);
    expect(assinaturaUpdate).not.toHaveBeenCalled();
  });

  it("falha do Asaas ao atualizar o valor: 502 e nada gravado", async () => {
    assinaturaFindUnique.mockResolvedValue(doGateway());
    atualizarValorNoAsaas.mockRejectedValue(new Error("fora do ar"));

    const res = await PATCH(requisicao({ valorMensal: 129.9 }), params);

    expect(res.status).toBe(502);
    expect(assinaturaUpdate).not.toHaveBeenCalled();
  });

  it("assinatura já CANCELADA não volta ao Asaas ao recontratar", async () => {
    assinaturaFindUnique.mockResolvedValue(doGateway({ status: "CANCELADA" }));

    const res = await PATCH(requisicao({ valorMensal: 129.9 }), params);

    expect(res.status).toBe(200);
    expect(atualizarValorNoAsaas).not.toHaveBeenCalled();
    expect(cancelarNoAsaas).not.toHaveBeenCalled();
  });

  it("recontratar limpa a data de encerramento", async () => {
    assinaturaFindUnique.mockResolvedValue(
      doGateway({ status: "CANCELADA", asaasSubscriptionId: null, encerraEm: new Date() })
    );

    await PATCH(requisicao({ valorMensal: 99.99 }), params);

    expect(assinaturaUpdate.mock.calls[0][0].data.encerraEm).toBeNull();
  });
});
