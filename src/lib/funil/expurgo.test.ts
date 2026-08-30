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

  const tx = {
    eventoFunil: { findMany, deleteMany },
    resumoDiario: { upsert },
    sessaoFunil: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
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

  it("não faz nada quando não há evento velho", async () => {
    const { cliente, upsert, deleteMany } = prismaFalso([]);

    const resultado = await expurgarEventos(cliente, AGORA);

    expect(upsert).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(resultado).toEqual({ resumidos: 0, apagados: 0 });
  });
});
