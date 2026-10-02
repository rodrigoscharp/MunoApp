/**
 * O espelho: cada cobrança que o Asaas emite para uma assinatura que já existe
 * vira uma Cobranca local, e é dela que a régua tira o atraso.
 *
 * Sem isto o cron pula a geração (o Asaas "gera"), o webhook ignora tudo que
 * não é o primeiro pagamento, e ninguém escreve a cobrança do mês 2: quem para
 * de pagar nunca fica INADIMPLENTE nem BLOQUEADA.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const assinaturaFindUnique = vi.fn();
const assinaturaUpdate = vi.fn();
const cobrancaFindUnique = vi.fn();
const cobrancaFindFirst = vi.fn();
const cobrancaCreate = vi.fn();
const cobrancaUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    assinatura: {
      findUnique: (...a: unknown[]) => assinaturaFindUnique(...a),
      update: (...a: unknown[]) => assinaturaUpdate(...a),
    },
    cobranca: {
      findUnique: (...a: unknown[]) => cobrancaFindUnique(...a),
      findFirst: (...a: unknown[]) => cobrancaFindFirst(...a),
      create: (...a: unknown[]) => cobrancaCreate(...a),
      update: (...a: unknown[]) => cobrancaUpdate(...a),
    },
  },
}));

import { espelharEventoDeAssinatura } from "./espelho";

const AGORA = new Date("2026-11-20T12:00:00Z");

const assinatura = {
  id: "ass-1",
  status: "ATIVA",
  valorMensal: 119.99,
};

function pagamento(event: string, extra: Record<string, unknown> = {}) {
  return {
    event,
    payment: {
      id: "pay_2",
      value: 119.99,
      subscription: "sub_1",
      dueDate: "2026-11-10",
      ...extra,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  assinaturaFindUnique.mockResolvedValue(assinatura);
  assinaturaUpdate.mockResolvedValue({});
  cobrancaFindUnique.mockResolvedValue(null);
  cobrancaFindFirst.mockResolvedValue(null);
  cobrancaCreate.mockResolvedValue({});
  cobrancaUpdate.mockResolvedValue({});
});

describe("cobrança de renovação emitida pelo Asaas", () => {
  it("PAYMENT_CREATED cria a Cobranca PENDENTE na competência do vencimento", async () => {
    const tratado = await espelharEventoDeAssinatura(pagamento("PAYMENT_CREATED"), AGORA);

    expect(tratado).toBe(true);
    expect(assinaturaFindUnique).toHaveBeenCalledWith({
      where: { asaasSubscriptionId: "sub_1" },
    });
    expect(cobrancaCreate).toHaveBeenCalledWith({
      data: {
        assinaturaId: "ass-1",
        competencia: "2026-11",
        valor: 119.99,
        vencimento: new Date("2026-11-10T00:00:00Z"),
        status: "PENDENTE",
        asaasPaymentId: "pay_2",
      },
    });
  });

  it("PAYMENT_OVERDUE cria a Cobranca já VENCIDA quando ela não existia", async () => {
    await espelharEventoDeAssinatura(pagamento("PAYMENT_OVERDUE"), AGORA);

    expect(cobrancaCreate.mock.calls[0][0].data.status).toBe("VENCIDA");
  });

  it("PAYMENT_OVERDUE vence uma Cobranca PENDENTE que já existia", async () => {
    cobrancaFindUnique.mockResolvedValue({ id: "c1", status: "PENDENTE" });

    await espelharEventoDeAssinatura(pagamento("PAYMENT_OVERDUE"), AGORA);

    expect(cobrancaCreate).not.toHaveBeenCalled();
    expect(cobrancaUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: {
        status: "VENCIDA",
        valor: 119.99,
        vencimento: new Date("2026-11-10T00:00:00Z"),
      },
    });
  });

  it("PAYMENT_UPDATED reajusta o vencimento de uma Cobranca em aberto, sem mudar o status", async () => {
    cobrancaFindUnique.mockResolvedValue({ id: "c1", status: "VENCIDA" });

    await espelharEventoDeAssinatura(
      pagamento("PAYMENT_UPDATED", { dueDate: "2026-11-25" }),
      AGORA
    );

    expect(cobrancaUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: {
        status: "VENCIDA",
        valor: 119.99,
        vencimento: new Date("2026-11-25T00:00:00Z"),
      },
    });
  });

  it("evento repetido para Cobranca já PAGA não a reabre", async () => {
    cobrancaFindUnique.mockResolvedValue({ id: "c1", status: "PAGA" });

    await espelharEventoDeAssinatura(pagamento("PAYMENT_OVERDUE"), AGORA);
    await espelharEventoDeAssinatura(pagamento("PAYMENT_CREATED"), AGORA);

    expect(cobrancaCreate).not.toHaveBeenCalled();
    expect(cobrancaUpdate).not.toHaveBeenCalled();
  });

  it("evento repetido para Cobranca CANCELADA pelo operador não a ressuscita", async () => {
    cobrancaFindUnique.mockResolvedValue({ id: "c1", status: "CANCELADA" });

    await espelharEventoDeAssinatura(pagamento("PAYMENT_CREATED"), AGORA);

    expect(cobrancaUpdate).not.toHaveBeenCalled();
  });
});

describe("o id do pagamento identifica a cobrança, não o mês", () => {
  // Vencimento remarcado no Asaas: o dueDate muda de mês, o id não. Sem o id, o
  // PAYMENT_UPDATED criava uma segunda cobrança no mês novo e a velha ficava
  // VENCIDA para sempre, bloqueando quem acabou de pagar.
  it("PAYMENT_UPDATED com vencimento em outro mês atualiza a mesma Cobranca", async () => {
    cobrancaFindUnique.mockImplementation(async ({ where }) =>
      where.asaasPaymentId === "pay_2"
        ? { id: "c1", status: "VENCIDA", asaasPaymentId: "pay_2" }
        : null
    );

    await espelharEventoDeAssinatura(
      pagamento("PAYMENT_UPDATED", { dueDate: "2026-12-05" }),
      AGORA
    );

    expect(cobrancaCreate).not.toHaveBeenCalled();
    expect(cobrancaUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: {
        status: "VENCIDA",
        valor: 119.99,
        vencimento: new Date("2026-12-05T00:00:00Z"),
      },
    });
  });

  it("adota a Cobranca da competência que ainda não tem id (criada antes desta coluna)", async () => {
    cobrancaFindUnique.mockImplementation(async ({ where }) =>
      where.assinaturaId_competencia
        ? { id: "c1", status: "PENDENTE", asaasPaymentId: null }
        : null
    );

    await espelharEventoDeAssinatura(pagamento("PAYMENT_OVERDUE"), AGORA);

    expect(cobrancaCreate).not.toHaveBeenCalled();
    expect(cobrancaUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: {
        status: "VENCIDA",
        valor: 119.99,
        vencimento: new Date("2026-11-10T00:00:00Z"),
        asaasPaymentId: "pay_2",
      },
    });
  });

  it("competência já ocupada por OUTRO pagamento não é sobrescrita: loga e segue", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    cobrancaFindUnique.mockImplementation(async ({ where }) =>
      where.assinaturaId_competencia
        ? { id: "c1", status: "PENDENTE", asaasPaymentId: "pay_outro" }
        : null
    );

    const tratado = await espelharEventoDeAssinatura(pagamento("PAYMENT_CREATED"), AGORA);

    expect(tratado).toBe(true);
    expect(cobrancaCreate).not.toHaveBeenCalled();
    expect(cobrancaUpdate).not.toHaveBeenCalled();
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});

describe("competência ocupada por cobrança cancelada", () => {
  // O Asaas apaga e recria o pagamento do mês (PAYMENT_DELETED seguido de
  // PAYMENT_CREATED com outro id). A cobrança antiga fica CANCELADA, e a nova
  // não pode ser descartada: sem ela a régua não enxerga o atraso.
  it("o pagamento novo toma o lugar da cobrança CANCELADA do mesmo mês", async () => {
    cobrancaFindUnique.mockImplementation(async ({ where }) =>
      where.assinaturaId_competencia
        ? { id: "c1", status: "CANCELADA", asaasPaymentId: "pay_antigo" }
        : null
    );

    await espelharEventoDeAssinatura(pagamento("PAYMENT_OVERDUE"), AGORA);

    expect(cobrancaUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: expect.objectContaining({ asaasPaymentId: "pay_2", status: "VENCIDA", pagoEm: null }),
    });
  });

  it("e o recriado já pago nasce PAGA", async () => {
    cobrancaFindUnique.mockImplementation(async ({ where }) =>
      where.assinaturaId_competencia
        ? { id: "c1", status: "CANCELADA", asaasPaymentId: "pay_antigo" }
        : null
    );

    await espelharEventoDeAssinatura(pagamento("PAYMENT_RECEIVED"), AGORA);

    expect(cobrancaUpdate.mock.calls[0][0].data).toMatchObject({ status: "PAGA", pagoEm: AGORA });
  });
});

describe("estorno e chargeback da renovação", () => {
  it.each(["PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED"])(
    "%s reabre a cobrança paga, para a régua voltar a contar",
    async (event) => {
      const erro = vi.spyOn(console, "error").mockImplementation(() => {});
      cobrancaFindUnique.mockResolvedValue({ id: "c1", status: "PAGA" });

      const tratado = await espelharEventoDeAssinatura(pagamento(event), AGORA);

      expect(tratado).toBe(true);
      expect(cobrancaUpdate).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { status: "VENCIDA", pagoEm: null },
      });
      expect(erro.mock.calls.flat().join(" ")).toContain("espelho/asaas:estorno");
      erro.mockRestore();
    }
  );

  it("estorno de cobrança que não estava paga não escreve nada", async () => {
    cobrancaFindUnique.mockResolvedValue({ id: "c1", status: "VENCIDA" });
    await espelharEventoDeAssinatura(pagamento("PAYMENT_REFUNDED"), AGORA);
    expect(cobrancaUpdate).not.toHaveBeenCalled();
  });

  it("evento repetido de estorno é idempotente", async () => {
    cobrancaFindUnique.mockResolvedValue({ id: "c1", status: "VENCIDA" });
    await espelharEventoDeAssinatura(pagamento("PAYMENT_CHARGEBACK_REQUESTED"), AGORA);
    await espelharEventoDeAssinatura(pagamento("PAYMENT_CHARGEBACK_REQUESTED"), AGORA);
    expect(cobrancaUpdate).not.toHaveBeenCalled();
  });
});

describe("pagamento da renovação", () => {
  it.each(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"])(
    "%s baixa a Cobranca existente e carimba pagoEm",
    async (event) => {
      cobrancaFindUnique.mockResolvedValue({ id: "c1", status: "VENCIDA" });

      await espelharEventoDeAssinatura(pagamento(event), AGORA);

      expect(cobrancaUpdate).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { status: "PAGA", pagoEm: AGORA },
      });
    }
  );

  it("pagamento sem Cobranca prévia (PAYMENT_CREATED perdido) cria já PAGA", async () => {
    await espelharEventoDeAssinatura(pagamento("PAYMENT_RECEIVED"), AGORA);

    expect(cobrancaCreate).toHaveBeenCalledWith({
      data: {
        assinaturaId: "ass-1",
        competencia: "2026-11",
        valor: 119.99,
        vencimento: new Date("2026-11-10T00:00:00Z"),
        status: "PAGA",
        pagoEm: AGORA,
        asaasPaymentId: "pay_2",
      },
    });
  });

  it("segunda entrega (RECEIVED depois de CONFIRMED) não mexe no pagoEm", async () => {
    cobrancaFindUnique.mockResolvedValue({ id: "c1", status: "PAGA" });

    await espelharEventoDeAssinatura(pagamento("PAYMENT_RECEIVED"), AGORA);

    expect(cobrancaUpdate).not.toHaveBeenCalled();
    expect(cobrancaCreate).not.toHaveBeenCalled();
  });

  it("pagamento sempre vence cobrança que o operador tinha cancelado: o dinheiro entrou", async () => {
    cobrancaFindUnique.mockResolvedValue({ id: "c1", status: "CANCELADA" });

    await espelharEventoDeAssinatura(pagamento("PAYMENT_CONFIRMED"), AGORA);

    expect(cobrancaUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { status: "PAGA", pagoEm: AGORA },
    });
  });
});

describe("cobrança apagada no Asaas", () => {
  it("PAYMENT_DELETED cancela Cobranca em aberto", async () => {
    cobrancaFindUnique.mockResolvedValue({ id: "c1", status: "PENDENTE" });

    await espelharEventoDeAssinatura(pagamento("PAYMENT_DELETED"), AGORA);

    expect(cobrancaUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { status: "CANCELADA" },
    });
  });

  it("PAYMENT_DELETED não cancela Cobranca já paga", async () => {
    cobrancaFindUnique.mockResolvedValue({ id: "c1", status: "PAGA" });

    await espelharEventoDeAssinatura(pagamento("PAYMENT_DELETED"), AGORA);

    expect(cobrancaUpdate).not.toHaveBeenCalled();
  });
});

describe("a régua depois do espelho", () => {
  it("recalcula o status da assinatura pela cobrança em aberto mais antiga", async () => {
    // Venceu há 16 dias: BLOQUEADA, mesmo que o cron ainda não tenha rodado.
    cobrancaFindFirst.mockResolvedValue({ vencimento: new Date("2026-11-04T00:00:00Z") });

    await espelharEventoDeAssinatura(pagamento("PAYMENT_OVERDUE"), AGORA);

    expect(assinaturaUpdate).toHaveBeenCalledWith({
      where: { id: "ass-1" },
      data: { status: "BLOQUEADA" },
    });
  });

  it("pagamento sem mais nada em aberto devolve a assinatura a ATIVA", async () => {
    assinaturaFindUnique.mockResolvedValue({ ...assinatura, status: "BLOQUEADA" });
    cobrancaFindUnique.mockResolvedValue({ id: "c1", status: "VENCIDA" });
    cobrancaFindFirst.mockResolvedValue(null);

    await espelharEventoDeAssinatura(pagamento("PAYMENT_CONFIRMED"), AGORA);

    expect(assinaturaUpdate).toHaveBeenCalledWith({
      where: { id: "ass-1" },
      data: { status: "ATIVA" },
    });
  });
});

describe("assinatura cancelada no Asaas", () => {
  /**
   * Cancelamento pelo gateway NÃO vira `CANCELADA`: esse status é "cortesia" e
   * dá acesso livre. O acesso vai até o fim do período já pago e então cai
   * (`encerraEm`, que o proxy confere).
   */
  const ultimaPaga = (vencimento: string) =>
    cobrancaFindFirst.mockImplementation(async ({ where }) =>
      where.status === "PAGA" ? { vencimento: new Date(vencimento) } : null
    );

  it.each(["SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED"])(
    "%s encerra o acesso no fim do período pago e não marca CANCELADA",
    async (event) => {
      ultimaPaga("2026-11-10T00:00:00Z"); // mensal: pago até 10/12

      const tratado = await espelharEventoDeAssinatura(
        { event, subscription: { id: "sub_1" } },
        AGORA
      );

      expect(tratado).toBe(true);
      expect(assinaturaUpdate).toHaveBeenCalledWith({
        where: { id: "ass-1" },
        data: { encerraEm: new Date("2026-12-10T00:00:00Z") },
      });
      expect(JSON.stringify(assinaturaUpdate.mock.calls)).not.toContain("CANCELADA");
    }
  );

  it("plano anual vale um ano a partir do último pagamento", async () => {
    assinaturaFindUnique.mockResolvedValue({ ...assinatura, ciclo: "ANUAL" });
    ultimaPaga("2026-11-10T00:00:00Z");

    await espelharEventoDeAssinatura({ event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_1" } }, AGORA);

    expect(assinaturaUpdate.mock.calls[0][0].data.encerraEm).toEqual(new Date("2027-11-10T00:00:00Z"));
  });

  it("período pago que já acabou encerra agora", async () => {
    ultimaPaga("2026-08-10T00:00:00Z"); // pago até 10/09, e hoje é 20/11

    await espelharEventoDeAssinatura({ event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_1" } }, AGORA);

    expect(assinaturaUpdate.mock.calls[0][0].data.encerraEm).toEqual(AGORA);
  });

  it("sem nenhum pagamento, encerra agora", async () => {
    cobrancaFindFirst.mockResolvedValue(null);

    await espelharEventoDeAssinatura({ event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_1" } }, AGORA);

    expect(assinaturaUpdate.mock.calls[0][0].data.encerraEm).toEqual(AGORA);
  });

  it("dia 31 não vaza para o mês seguinte: 31/01 + 1 mês é 28/02", async () => {
    ultimaPaga("2027-01-31T00:00:00Z");
    await espelharEventoDeAssinatura(
      { event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_1" } },
      new Date("2027-02-01T12:00:00Z")
    );
    expect(assinaturaUpdate.mock.calls[0][0].data.encerraEm).toEqual(new Date("2027-02-28T00:00:00Z"));
  });

  // O operador cancelou no CRM (cortesia, acesso livre) e a rota cancelou a
  // assinatura no Asaas; o webhook SUBSCRIPTION_DELETED que volta não pode
  // transformar a cortesia em bloqueio.
  it("assinatura CANCELADA pelo operador não ganha data de encerramento", async () => {
    assinaturaFindUnique.mockResolvedValue({ ...assinatura, status: "CANCELADA" });
    ultimaPaga("2026-11-10T00:00:00Z");

    const tratado = await espelharEventoDeAssinatura(
      { event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_1" } },
      AGORA
    );

    expect(tratado).toBe(true);
    expect(assinaturaUpdate).not.toHaveBeenCalled();
  });

  it("evento repetido não adia um encerramento já marcado", async () => {
    const jaMarcada = new Date("2026-12-10T00:00:00Z");
    assinaturaFindUnique.mockResolvedValue({ ...assinatura, encerraEm: jaMarcada });
    ultimaPaga("2026-11-10T00:00:00Z");

    await espelharEventoDeAssinatura({ event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_1" } }, AGORA);

    expect(assinaturaUpdate).not.toHaveBeenCalled();
  });

  it("assinatura que não é nossa é tratada como nada a fazer", async () => {
    assinaturaFindUnique.mockResolvedValue(null);

    const tratado = await espelharEventoDeAssinatura(
      { event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_x" } },
      AGORA
    );

    expect(tratado).toBe(true);
    expect(assinaturaUpdate).not.toHaveBeenCalled();
  });
});

describe("o que o espelho não trata", () => {
  it("pagamento de assinatura que ainda não existe devolve false: é o primeiro pagamento, do provisionamento", async () => {
    assinaturaFindUnique.mockResolvedValue(null);

    const tratado = await espelharEventoDeAssinatura(pagamento("PAYMENT_CONFIRMED"), AGORA);

    expect(tratado).toBe(false);
    expect(cobrancaCreate).not.toHaveBeenCalled();
  });

  it("pagamento sem subscription devolve false sem consultar o banco", async () => {
    const tratado = await espelharEventoDeAssinatura(
      pagamento("PAYMENT_CONFIRMED", { subscription: undefined }),
      AGORA
    );

    expect(tratado).toBe(false);
    expect(assinaturaFindUnique).not.toHaveBeenCalled();
  });

  it("evento que o espelho não conhece devolve false", async () => {
    const tratado = await espelharEventoDeAssinatura(pagamento("PAYMENT_RESTORED"), AGORA);

    expect(tratado).toBe(false);
    expect(cobrancaCreate).not.toHaveBeenCalled();
    expect(cobrancaUpdate).not.toHaveBeenCalled();
  });

  it("vencimento ilegível não escreve nada, mas responde tratado para o Asaas não reentregar para sempre", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});

    const tratado = await espelharEventoDeAssinatura(
      pagamento("PAYMENT_CREATED", { dueDate: "ontem" }),
      AGORA
    );

    expect(tratado).toBe(true);
    expect(cobrancaCreate).not.toHaveBeenCalled();
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});
