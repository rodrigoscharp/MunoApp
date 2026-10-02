/**
 * A sessão do console da plataforma dá acesso a todos os restaurantes. Sem
 * reconferir, um admin removido (ou cujo cookie vazou) continuava entrando por
 * até 30 dias, e trocar a senha com `platform:senha` não derrubava nada.
 */

import { describe, expect, it, vi, beforeEach, beforeAll, afterEach } from "vitest";

const adminFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: { platformAdmin: { findUnique: (...a: unknown[]) => adminFindUnique(...a) } },
  prisma: {},
}));

type Jwt = (a: {
  token: Record<string, unknown>;
  user?: Record<string, unknown>;
}) => Promise<Record<string, unknown> | null>;
const capturado: { config?: { session: { maxAge?: number }; callbacks: { jwt: Jwt } } } = {};

vi.mock("next-auth", () => ({
  default: (config: NonNullable<typeof capturado.config>) => {
    capturado.config = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  },
}));

beforeAll(async () => {
  await import("@/lib/auth-platform");
});

const AGORA = new Date("2026-10-02T12:00:00Z").getTime();
const jwt = () => capturado.config!.callbacks.jwt;
const tokenVelho = () => ({ id: "adm-1", verificadoEm: AGORA - 5 * 60_000 - 1 });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  adminFindUnique.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("sessão da plataforma", () => {
  it("dura 7 dias", () => {
    expect(capturado.config!.session.maxAge).toBe(7 * 24 * 60 * 60);
  });

  it("no login carimba a verificação e não consulta o banco", async () => {
    const token = await jwt()({ token: {}, user: { id: "adm-1" } });
    expect(token).toMatchObject({ id: "adm-1", verificadoEm: AGORA });
    expect(adminFindUnique).not.toHaveBeenCalled();
  });

  it("dentro de 5 minutos não vai ao banco", async () => {
    await jwt()({ token: { id: "adm-1", verificadoEm: AGORA - 1000 } });
    expect(adminFindUnique).not.toHaveBeenCalled();
  });

  it("depois de 5 minutos confere se o admin ainda existe", async () => {
    adminFindUnique.mockResolvedValue({ id: "adm-1" });
    const token = await jwt()({ token: tokenVelho() });
    expect(adminFindUnique).toHaveBeenCalledWith({
      where: { id: "adm-1" },
      select: { id: true },
    });
    expect(token).toMatchObject({ verificadoEm: AGORA });
  });

  it("admin removido perde a sessão", async () => {
    adminFindUnique.mockResolvedValue(null);
    expect(await jwt()({ token: tokenVelho() })).toBeNull();
  });

  it("falha do banco mantém a sessão e tenta de novo na próxima", async () => {
    adminFindUnique.mockRejectedValue(new Error("timeout"));
    const antigo = tokenVelho();
    const token = await jwt()({ token: antigo });
    expect(token).toMatchObject({ id: "adm-1", verificadoEm: antigo.verificadoEm });
  });
});
