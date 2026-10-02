/**
 * A sessão do console da plataforma dá acesso a todos os restaurantes. Sem
 * reconferir, um admin removido (ou cujo cookie vazou) continuava entrando por
 * até 30 dias, e trocar a senha com `platform:senha` não derrubava nada.
 */

import { describe, expect, it, vi, beforeEach, beforeAll, afterEach } from "vitest";
import bcrypt from "bcryptjs";

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

let autorizar: (c: Record<string, unknown>, r?: Request) => Promise<Record<string, unknown> | null>;
let hashDaSenha: string;

beforeAll(async () => {
  const mod = await import("@/lib/auth-platform");
  autorizar = mod.autorizarPlataforma as typeof autorizar;
  hashDaSenha = await bcrypt.hash("y".repeat(14), 10);
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
      select: { id: true, passwordChangedAt: true },
    });
    expect(token).toMatchObject({ verificadoEm: AGORA });
  });

  it("admin removido perde a sessão", async () => {
    adminFindUnique.mockResolvedValue(null);
    expect(await jwt()({ token: tokenVelho() })).toBeNull();
  });

  it("sessão aberta antes da troca de senha do admin é encerrada", async () => {
    adminFindUnique.mockResolvedValue({ id: "adm-1", passwordChangedAt: new Date(AGORA - 60_000) });
    const token = { ...tokenVelho(), iat: Math.floor((AGORA - 3_600_000) / 1000) };
    expect(await jwt()({ token })).toBeNull();
  });

  it("falha do banco mantém a sessão e tenta de novo na próxima", async () => {
    adminFindUnique.mockRejectedValue(new Error("timeout"));
    const antigo = tokenVelho();
    const token = await jwt()({ token: antigo });
    expect(token).toMatchObject({ id: "adm-1", verificadoEm: antigo.verificadoEm });
  });
});


describe("login do console da plataforma", () => {
  const comIp = (ip?: string) =>
    new Request("http://admin.localhost/api/platform/auth", {
      headers: ip ? { "x-forwarded-for": ip } : {},
    });

  beforeEach(() => {
    vi.useRealTimers();
    adminFindUnique.mockReset();
    adminFindUnique.mockResolvedValue({
      id: "adm-1", nome: "Admin", email: "adm@muno.com", password: hashDaSenha,
    });
  });

  it("autentica com e-mail e senha corretos, sem devolver o hash", async () => {
    const admin = await autorizar({ email: "adm@muno.com", password: "y".repeat(14) }, comIp());
    expect(admin).toEqual({ id: "adm-1", name: "Admin", email: "adm@muno.com" });
  });

  it("recusa senha errada", async () => {
    expect(await autorizar({ email: "adm@muno.com", password: "x".repeat(12) }, comIp())).toBeNull();
  });

  it("e-mail que não existe também gasta um bcrypt (o tempo não denuncia quem é admin)", async () => {
    adminFindUnique.mockResolvedValue(null);
    const compare = vi.spyOn(bcrypt, "compare");

    await autorizar({ email: "ninguem@muno.com", password: "x".repeat(13) }, comIp());

    expect(compare).toHaveBeenCalledTimes(1);
    compare.mockRestore();
  });

  it("passa de 20 tentativas do mesmo IP em 10 minutos: recusa até a senha certa", async () => {
    const ip = "203.0.113.9";
    for (let i = 0; i < 20; i++) {
      await autorizar({ email: `x${i}@muno.com`, password: "x".repeat(11) }, comIp(ip));
    }
    expect(await autorizar({ email: "adm@muno.com", password: "y".repeat(14) }, comIp(ip))).toBeNull();
  });

  it("trava de e-mail: 10 tentativas erradas bloqueiam aquela conta", async () => {
    for (let i = 0; i < 10; i++) {
      await autorizar({ email: "alvo@muno.com", password: "x".repeat(11) }, comIp());
    }
    expect(await autorizar({ email: "alvo@muno.com", password: "y".repeat(14) }, comIp())).toBeNull();
  });
});
