import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  eventoSistema: { findMany: vi.fn(), findFirst: vi.fn() },
  inscricao: { count: vi.fn(), findFirst: vi.fn() },
  order: { count: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prismaUnscoped: prismaMock }));

import { coletarDadosDeSaude } from "./coletar";

// O texto que o Prisma devolveria num erro de consulta: pode ecoar SQL e
// valores, e por isso nunca pode chegar ao log.
const SEGREDO = 'column "xyz" does not exist in: SELECT * FROM "Order" WHERE phone = \'11999998888\'';

describe("coletarDadosDeSaude quando o banco falha", () => {
  let erro: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    erro = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
    erro.mockRestore();
  });

  const textoDoLog = () => JSON.stringify(erro.mock.calls);

  it("select 1 rejeita: devolve banco fora do ar e deixa rastro no log", async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error(SEGREDO));

    const d = await coletarDadosDeSaude(new Date());

    expect(d).toEqual({ banco: { ok: false, ms: expect.any(Number) }, leitura: null });
    expect(erro).toHaveBeenCalledTimes(1);
    expect(textoDoLog()).toContain("[saude]");
    expect(textoDoLog()).not.toContain(SEGREDO);
    expect(textoDoLog()).not.toContain("11999998888");
  });

  it("select 1 responde e a leitura rejeita: mesmo resultado, com rastro no log", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    prismaMock.eventoSistema.findMany.mockRejectedValue(new Error(SEGREDO));
    prismaMock.eventoSistema.findFirst.mockResolvedValue(null);
    prismaMock.inscricao.count.mockResolvedValue(0);
    prismaMock.inscricao.findFirst.mockResolvedValue(null);
    prismaMock.order.count.mockResolvedValue(0);
    prismaMock.order.findFirst.mockResolvedValue(null);

    const d = await coletarDadosDeSaude(new Date());

    expect(d).toEqual({ banco: { ok: false, ms: expect.any(Number) }, leitura: null });
    expect(erro).toHaveBeenCalledTimes(1);
    expect(textoDoLog()).toContain("[saude]");
    expect(textoDoLog()).not.toContain(SEGREDO);
    expect(textoDoLog()).not.toContain("11999998888");
  });
});
