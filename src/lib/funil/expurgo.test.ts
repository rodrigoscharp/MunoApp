import { describe, expect, it, vi } from "vitest";
import { expurgarEventos, limiteDoExpurgo } from "./expurgo";

const AGORA = new Date("2026-08-30T09:00:00.000Z");

describe("limiteDoExpurgo", () => {
  it("é 90 dias antes de agora", () => {
    expect(limiteDoExpurgo(AGORA).toISOString()).toBe("2026-06-01T09:00:00.000Z");
  });
});

function prismaFalso(eventos: unknown[]) {
  const upsert = vi.fn().mockResolvedValue({});
  const deleteMany = vi.fn().mockResolvedValue({ count: eventos.length });
  const findMany = vi.fn().mockResolvedValue(eventos);
  const sessaoDeleteMany = vi.fn().mockResolvedValue({ count: 0 });

  const tx = {
    eventoFunil: { findMany, deleteMany },
    resumoDiario: { upsert },
    sessaoFunil: { deleteMany: sessaoDeleteMany },
  };

  // Cast porque um punhado de vi.fn() não satisfaz o tipo gerado pelo Prisma,
  // e tipar o fake por inteiro seria reescrever o client para provar três
  // asserções.
  return {
    cliente: {
      $transaction: (fn: (t: unknown) => unknown) => fn(tx),
    } as unknown as Parameters<typeof expurgarEventos>[0],
    upsert,
    deleteMany,
    sessaoDeleteMany,
  };
}

describe("expurgarEventos", () => {
  const antigo = {
    tipo: "VISITA",
    createdAt: new Date("2026-05-01T10:00:00.000Z"),
    sessao: { utmSource: "instagram" },
  };

  it("resume antes de apagar", async () => {
    const { cliente, upsert, deleteMany } = prismaFalso([antigo, antigo]);

    const resultado = await expurgarEventos(cliente, AGORA);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.invocationCallOrder[0]).toBeLessThan(
      deleteMany.mock.invocationCallOrder[0]
    );
    expect(resultado).toEqual({ resumidos: 1, apagados: 2 });
  });

  // Idempotência: o cron rodando duas vezes no mesmo dia soma no lugar de
  // duplicar, e uma falha no meio não deixa um dia contado pela metade.
  it("soma no resumo que já existe, em vez de sobrescrever", async () => {
    const { cliente, upsert } = prismaFalso([antigo]);

    await expurgarEventos(cliente, AGORA);

    expect(upsert.mock.calls[0][0].update).toEqual({ n: { increment: 1 } });
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      origem: "instagram",
      tipo: "VISITA",
      n: 1,
    });
  });

  it("sem evento velho, não resume nem apaga evento, mas ainda varre sessão órfã", async () => {
    const { cliente, upsert, deleteMany, sessaoDeleteMany } = prismaFalso([]);

    const resultado = await expurgarEventos(cliente, AGORA);

    expect(upsert).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(sessaoDeleteMany).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual({ resumidos: 0, apagados: 0 });
  });

  it("só apaga sessão sem evento, sem lead e sem inscrição", async () => {
    const { cliente, sessaoDeleteMany } = prismaFalso([antigo]);

    await expurgarEventos(cliente, AGORA);

    // As três relações vazias, juntas. Sessão com qualquer uma delas viva é a
    // costura de alguém que comprou: apagá-la perde a origem de um cliente,
    // e isso não volta.
    const { where } = sessaoDeleteMany.mock.calls[0][0];
    expect(where).toMatchObject({
      eventos: { none: {} },
      leads: { none: {} },
      inscricoes: { none: {} },
    });
    expect(where.createdAt).toEqual({ lt: limiteDoExpurgo(AGORA) });
  });

  it("apaga a sessão órfã depois de apagar os eventos, nunca antes", async () => {
    // Ordem importa aqui pelo mesmo motivo do resumo: enquanto o evento
    // existir, a sessão não conta como órfã, e a faxina não teria efeito.
    const { cliente, deleteMany, sessaoDeleteMany } = prismaFalso([antigo]);

    await expurgarEventos(cliente, AGORA);

    expect(deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      sessaoDeleteMany.mock.invocationCallOrder[0]
    );
  });
});
