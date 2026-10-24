import { describe, expect, it, vi, beforeEach } from "vitest";

const after = vi.fn();
vi.mock("next/server", () => ({ after: (...a: unknown[]) => after(...a) }));

import { depoisDaResposta } from "./depois-da-resposta";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("depoisDaResposta", () => {
  it("dentro de uma requisição entrega a tarefa ao after, sem rodá-la antes da resposta", () => {
    const tarefa = vi.fn().mockResolvedValue(undefined);

    depoisDaResposta(tarefa);

    expect(after).toHaveBeenCalledWith(tarefa);
    expect(tarefa).not.toHaveBeenCalled();
  });

  it("fora de uma requisição roda a tarefa na hora, em vez de perdê-la", () => {
    after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });
    const tarefa = vi.fn().mockResolvedValue(undefined);

    depoisDaResposta(tarefa);

    expect(tarefa).toHaveBeenCalledTimes(1);
  });

  it("tarefa que falha fora de uma requisição não vira rejeição solta", async () => {
    after.mockImplementation(() => {
      throw new Error("fora de requisição");
    });
    const rejeicoes: unknown[] = [];
    const ouvir = (e: unknown) => rejeicoes.push(e);
    process.on("unhandledRejection", ouvir);

    expect(() => depoisDaResposta(() => Promise.reject(new Error("realtime fora")))).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));

    process.off("unhandledRejection", ouvir);
    expect(rejeicoes).toEqual([]);
  });
});
