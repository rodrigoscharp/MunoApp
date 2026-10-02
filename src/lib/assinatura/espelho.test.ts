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
  it.each(["SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED"])(
    "%s marca a Assinatura como CANCELADA",
    async (event) => {
      const tratado = await espelharEventoDeAssinatura(
        { event, subscription: { id: "sub_1" } },
        AGORA
      );

      expect(tratado).toBe(true);
      expect(assinaturaUpdate).toHaveBeenCalledWith({
        where: { id: "ass-1" },
        data: { status: "CANCELADA" },
      });
    }
  );

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
    const tratado = await espelharEventoDeAssinatura(pagamento("PAYMENT_REFUNDED"), AGORA);

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
