import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O layout envolve a tela de saúde. Se as contagens do menu lançassem com o
// banco fora do ar, a tela que existe para mostrar o banco fora do ar nunca
// abriria. O que este teste trava: contagem que falha vira zero e linha no
// log, só com a classe do erro (a mensagem do Prisma pode trazer SQL).

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-inter" }),
}));

vi.mock("@/lib/auth-platform", () => ({
  authPlatform: vi.fn().mockResolvedValue({ user: { id: "p1", name: "Ana", email: "ana@muno.dev" } }),
}));

vi.mock("@/lib/saude/coletar", () => ({
  coletarSaudeDaRequisicao: vi
    .fn()
    .mockResolvedValue({ agora: new Date(), dados: { banco: { ok: false, ms: null }, leitura: null } }),
}));

// Fora do Next não há cache incremental: o wrapper vira a própria função, e o
// teste exercita a consulta e o `.catch` que ficam em volta dele.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const leadCount = vi.fn();
const cobrancaCount = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    lead: { count: (...a: unknown[]) => leadCount(...a) },
    cobranca: { count: (...a: unknown[]) => cobrancaCount(...a) },
  },
}));

import { MenuLateral } from "@/components/platform/MenuLateral";
import PlatformLayout from "./layout";

class ErroDoPrisma extends Error {
  constructor() {
    super("Can't reach database server at db.supabase.co:5432");
    this.name = "PrismaClientInitializationError";
  }
}

/** As props do primeiro elemento do tipo pedido, procurando na árvore devolvida. */
function propsDe(no: ReactNode, tipo: unknown): Record<string, unknown> | null {
  if (Array.isArray(no)) {
    for (const filho of no) {
      const achado = propsDe(filho, tipo);
      if (achado) return achado;
    }
    return null;
  }
  if (!isValidElement(no)) return null;
  const props = no.props as Record<string, unknown> & { children?: ReactNode };
  if (no.type === tipo) return props;
  return propsDe(props.children, tipo);
}

let erro: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  erro = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  erro.mockRestore();
  vi.clearAllMocks();
});

describe("PlatformLayout", () => {
  it("com o banco fora do ar, as contagens do menu viram zero e o layout ainda abre", async () => {
    leadCount.mockRejectedValue(new ErroDoPrisma());
    cobrancaCount.mockRejectedValue(new ErroDoPrisma());

    const tela = await PlatformLayout({ children: null });

    expect(propsDe(tela, MenuLateral)?.contagens).toEqual({ novos: 0, negociando: 0, atrasadas: 0 });
    expect(erro).toHaveBeenCalledWith("[console] contagem do menu falhou", "PrismaClientInitializationError");
    expect(erro).toHaveBeenCalledTimes(3);
    // Nada da mensagem (que pode trazer host e SQL) chega ao log.
    expect(JSON.stringify(erro.mock.calls)).not.toContain("supabase");
  });

  it("com o banco no ar, conta e não escreve nada no log", async () => {
    leadCount.mockImplementation(({ where }: { where: { status: string } }) =>
      Promise.resolve(where.status === "NOVO" ? 4 : 2)
    );
    cobrancaCount.mockResolvedValue(1);

    const tela = await PlatformLayout({ children: null });

    expect(propsDe(tela, MenuLateral)?.contagens).toEqual({ novos: 4, negociando: 2, atrasadas: 1 });
    expect(erro).not.toHaveBeenCalled();
  });

  it("conta atrasadas no banco, com o mesmo limite de dia que diasDeAtraso usa", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-24T13:30:00Z"), toFake: ["Date"] });
    leadCount.mockResolvedValue(0);
    cobrancaCount.mockResolvedValue(0);

    try {
      await PlatformLayout({ children: null });
    } finally {
      vi.useRealTimers();
    }

    // Contagem, e não as linhas: trazer cada cobrança em aberto para contar
    // no JavaScript era o que este teste existe para não deixar voltar.
    expect(cobrancaCount).toHaveBeenCalledWith({
      where: {
        status: { in: ["PENDENTE", "VENCIDA"] },
        vencimento: { lt: new Date("2026-10-24T00:00:00.000Z") },
      },
    });
  });
});
