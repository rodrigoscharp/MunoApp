import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const inscricaoFindMany = vi.fn();
const eventoFunilCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    inscricao: { findMany: (...a: unknown[]) => inscricaoFindMany(...a) },
    eventoFunil: { create: (...a: unknown[]) => eventoFunilCreate(...a) },
  },
}));

const temPagamento = vi.fn();
vi.mock("@/lib/assinatura/asaas", () => ({
  assinaturaTemPagamentoConfirmado: (...a: unknown[]) => temPagamento(...a),
}));

const provisionar = vi.fn();
vi.mock("@/lib/assinatura/provisionamento", () => ({
  provisionarInscricao: (...a: unknown[]) => provisionar(...a),
}));

const { reconciliarInscricoesPagas } = await import("./reconciliacao");

function inscricao(over: Record<string, unknown> = {}) {
  return {
    id: "insc-1",
    slug: "pizzaria",
    email: "dono@pizzaria.com",
    asaasSubscriptionId: "sub_1",
    sessaoId: "sessao-1",
    plano: "MEMBRO",
    ...over,
  };
}

let erroSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  inscricaoFindMany.mockResolvedValue([]);
  temPagamento.mockResolvedValue(false);
  provisionar.mockResolvedValue({ tenantId: "tenant-1" });
  eventoFunilCreate.mockResolvedValue({});
  erroSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  erroSpy.mockRestore();
});

const AGORA = new Date("2026-08-27T09:00:00Z");

describe("reconciliarInscricoesPagas", () => {
  // A rede de segurança do provisionamento. O caminho normal é o webhook do
  // Asaas; quando ele não chega — fila interrompida, deploy caindo, rede — o
  // cliente pagou e nada aconteceu. Sem isto, alguém precisa LER um log para
  // descobrir. Com isto, o sistema termina o serviço sozinho.
  it("procura só inscrição não provisionada que já tem assinatura no Asaas", async () => {
    await reconciliarInscricoesPagas(AGORA);

    expect(inscricaoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "AGUARDANDO_PAGAMENTO",
          asaasSubscriptionId: { not: null },
        },
      })
    );
  });

  it("da mais antiga para a mais nova: quem espera há mais tempo é atendido antes", async () => {
    await reconciliarInscricoesPagas(AGORA);

    expect(inscricaoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "asc" } })
    );
  });

  it("não provisiona quem ainda não pagou", async () => {
    inscricaoFindMany.mockResolvedValue([inscricao()]);
    temPagamento.mockResolvedValue(false);

    const resultado = await reconciliarInscricoesPagas(AGORA);

    expect(provisionar).not.toHaveBeenCalled();
    expect(resultado).toMatchObject({ candidatas: 1, provisionadas: 0, falhas: 0 });
  });

  it("provisiona quem o Asaas confirma que pagou", async () => {
    inscricaoFindMany.mockResolvedValue([inscricao()]);
    temPagamento.mockResolvedValue(true);

    const resultado = await reconciliarInscricoesPagas(AGORA);

    expect(provisionar).toHaveBeenCalledWith(
      expect.objectContaining({ id: "insc-1" }),
      expect.objectContaining({ origem: "cron/reconciliacao" })
    );
    expect(resultado).toMatchObject({ candidatas: 1, provisionadas: 1, falhas: 0 });
  });

  // Toda reconciliação bem-sucedida é a prova de que o webhook falhou naquele
  // caso. Provisionar em silêncio consertaria o sintoma e esconderia a causa.
  it("cada recuperação deixa log, porque significa que o webhook falhou", async () => {
    inscricaoFindMany.mockResolvedValue([inscricao()]);
    temPagamento.mockResolvedValue(true);

    await reconciliarInscricoesPagas(AGORA);

    expect(erroSpy).toHaveBeenCalledWith(expect.stringContaining("insc-1"));
  });

  it("uma que falha não impede as outras, e entra na contagem de falhas", async () => {
    inscricaoFindMany.mockResolvedValue([
      inscricao({ id: "insc-ruim", asaasSubscriptionId: "sub_ruim" }),
      inscricao({ id: "insc-boa", asaasSubscriptionId: "sub_boa" }),
    ]);
    temPagamento.mockImplementation(async (sub: string) => {
      if (sub === "sub_ruim") throw new Error("Asaas respondeu 500");
      return true;
    });

    const resultado = await reconciliarInscricoesPagas(AGORA);

    expect(provisionar).toHaveBeenCalledTimes(1);
    expect(provisionar).toHaveBeenCalledWith(
      expect.objectContaining({ id: "insc-boa" }),
      expect.anything()
    );
    expect(resultado).toMatchObject({ candidatas: 2, provisionadas: 1, falhas: 1 });
  });

  // provisionarInscricao pode falhar por dado ruim (slug que virou inválido)
  // ou infraestrutura. O laço não pode morrer junto.
  it("falha no provisionamento também é contida", async () => {
    inscricaoFindMany.mockResolvedValue([inscricao()]);
    temPagamento.mockResolvedValue(true);
    provisionar.mockRejectedValue(new Error("banco fora do ar"));

    const resultado = await reconciliarInscricoesPagas(AGORA);

    expect(resultado).toMatchObject({ candidatas: 1, provisionadas: 0, falhas: 1 });
  });

  // Este é o outro caminho que não é o webhook: quando ele não chega, esta
  // reconciliação é quem provisiona — e é ela quem precisa emitir PAGOU,
  // porque nada mais vai emitir para esta sessão.
  it("emite PAGOU antes de provisionar", async () => {
    inscricaoFindMany.mockResolvedValue([inscricao()]);
    temPagamento.mockResolvedValue(true);

    await reconciliarInscricoesPagas(AGORA);

    expect(eventoFunilCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessaoId: "sessao-1", tipo: "PAGOU" }),
      })
    );
    expect(
      eventoFunilCreate.mock.invocationCallOrder[0]
    ).toBeLessThan(provisionar.mock.invocationCallOrder[0]);
  });

  // Teto por execução: o job roda uma vez por dia e não pode virar uma
  // varredura ilimitada contra o gateway se algo empilhar. O que sobrar fica
  // para a passada seguinte, na ordem certa.
  it("limita quantas verifica numa passada", async () => {
    await reconciliarInscricoesPagas(AGORA);

    const { take } = inscricaoFindMany.mock.calls[0][0];
    expect(take).toBeGreaterThan(0);
    expect(take).toBeLessThanOrEqual(100);
  });
});
