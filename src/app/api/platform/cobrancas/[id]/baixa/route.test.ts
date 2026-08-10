import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// 20/08: os vencimentos dos casos abaixo ficam todos no passado, então a régua
// tem o que medir sem depender do dia em que a suíte roda.
const HOJE = new Date("2026-08-20T12:00:00Z");

// --- mocks -----------------------------------------------------------------

const authPlatform = vi.fn();
vi.mock("@/lib/auth-platform", () => ({
  authPlatform: () => authPlatform(),
}));

const cobrancaFindUnique = vi.fn();
const cobrancaUpdate = vi.fn();
const cobrancaFindFirst = vi.fn();
const assinaturaUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    cobranca: {
      findUnique: (...args: unknown[]) => cobrancaFindUnique(...args),
      update: (...args: unknown[]) => cobrancaUpdate(...args),
      findFirst: (...args: unknown[]) => cobrancaFindFirst(...args),
    },
    assinatura: {
      update: (...args: unknown[]) => assinaturaUpdate(...args),
    },
  },
}));

const { POST } = await import(
  "@/app/api/platform/cobrancas/[id]/baixa/route"
);

// --- helpers ---------------------------------------------------------------

function requisicao(id = "cob-1") {
  return [
    new NextRequest(`http://localhost/api/platform/cobrancas/${id}/baixa`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id }) },
  ] as const;
}

function cobranca(sobrescreve: Record<string, unknown> = {}) {
  return {
    id: "cob-1",
    status: "VENCIDA",
    pagoEm: null,
    assinaturaId: "assin-1",
    assinatura: { id: "assin-1", status: "BLOQUEADA" },
    ...sobrescreve,
  };
}

/** Nenhuma outra cobrança em aberto sobrou depois da baixa. */
function semOutraEmAberto() {
  cobrancaFindFirst.mockResolvedValue(null);
}

/** Sobrou uma cobrança em aberto vencida em `vencimento`. */
function outraEmAberto(vencimento: string) {
  cobrancaFindFirst.mockResolvedValue({ vencimento: new Date(vencimento) });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Só o relógio: mexer em setTimeout/queueMicrotask trava o await da rota.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(HOJE);
  authPlatform.mockResolvedValue({ user: { email: "op@muno" } });
  cobrancaFindUnique.mockResolvedValue(cobranca());
  cobrancaUpdate.mockImplementation(async ({ data }: { data: unknown }) => ({
    ...cobranca(),
    ...(data as object),
  }));
  semOutraEmAberto();
  assinaturaUpdate.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

// --- testes ----------------------------------------------------------------

describe("POST /api/platform/cobrancas/[id]/baixa — autorização", () => {
  it("recusa sem sessão de plataforma e não escreve nada", async () => {
    authPlatform.mockResolvedValue(null);

    const res = await POST(...requisicao());

    expect(res.status).toBe(401);
    expect(cobrancaFindUnique).not.toHaveBeenCalled();
    expect(cobrancaUpdate).not.toHaveBeenCalled();
    expect(assinaturaUpdate).not.toHaveBeenCalled();
  });

  it("recusa sessão sem usuário", async () => {
    authPlatform.mockResolvedValue({});

    const res = await POST(...requisicao());

    expect(res.status).toBe(401);
    expect(cobrancaUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /api/platform/cobrancas/[id]/baixa — a baixa", () => {
  it("marca a cobrança como PAGA com pagoEm agora", async () => {
    const res = await POST(...requisicao());

    expect(res.status).toBe(200);
    expect(cobrancaUpdate).toHaveBeenCalledTimes(1);
    expect(cobrancaUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "cob-1" },
      data: { status: "PAGA", pagoEm: HOJE },
    });
  });

  it("devolve 404 para id que não existe, sem escrever", async () => {
    cobrancaFindUnique.mockResolvedValue(null);

    const res = await POST(...requisicao("cob-fantasma"));

    expect(res.status).toBe(404);
    expect(cobrancaUpdate).not.toHaveBeenCalled();
    expect(assinaturaUpdate).not.toHaveBeenCalled();
  });

  it("é idempotente: a segunda baixa não regrava nem move o pagoEm", async () => {
    await POST(...requisicao());
    expect(cobrancaUpdate).toHaveBeenCalledTimes(1);

    // Segunda tentativa: o operador clicou duas vezes, ou dois operadores
    // conferiram o mesmo PIX. O banco já está com a cobrança paga.
    const pagoEmOriginal = new Date("2026-08-19T15:00:00Z");
    cobrancaFindUnique.mockResolvedValue(
      cobranca({ status: "PAGA", pagoEm: pagoEmOriginal })
    );

    const res = await POST(...requisicao());
    const corpo = await res.json();

    expect(res.status).toBe(200);
    // Nenhuma escrita nova na cobrança: o pagoEm da primeira baixa é a hora em
    // que o dinheiro entrou, e um segundo clique não pode adiá-la.
    expect(cobrancaUpdate).toHaveBeenCalledTimes(1);
    expect(corpo.cobranca.pagoEm).toBe(pagoEmOriginal.toISOString());
    expect(corpo.cobranca.status).toBe("PAGA");
  });

  it("recusa baixa em cobrança CANCELADA", async () => {
    // Cancelar é decisão humana, tomada por algum motivo. Dar baixa nela
    // ressuscitaria uma dívida que a plataforma já tinha perdoado.
    cobrancaFindUnique.mockResolvedValue(cobranca({ status: "CANCELADA" }));

    const res = await POST(...requisicao());

    expect(res.status).toBe(409);
    expect(cobrancaUpdate).not.toHaveBeenCalled();
    expect(assinaturaUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /api/platform/cobrancas/[id]/baixa — recálculo pela régua", () => {
  it("procura a em aberto mais antiga que sobrou, ignorando as pagas", async () => {
    await POST(...requisicao());

    expect(cobrancaFindFirst).toHaveBeenCalledTimes(1);
    expect(cobrancaFindFirst.mock.calls[0][0]).toMatchObject({
      where: {
        assinaturaId: "assin-1",
        status: { in: ["PENDENTE", "VENCIDA"] },
      },
      orderBy: { vencimento: "asc" },
    });
  });

  it("volta a ATIVA quando não resta nenhuma em aberto", async () => {
    semOutraEmAberto();

    const res = await POST(...requisicao());
    const corpo = await res.json();

    expect(res.status).toBe(200);
    expect(assinaturaUpdate).toHaveBeenCalledTimes(1);
    expect(assinaturaUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "assin-1" },
      data: { status: "ATIVA" },
    });
    expect(corpo.assinatura.status).toBe("ATIVA");
  });

  it("continua BLOQUEADA quando outra cobrança segue vencida há 15+ dias", async () => {
    // O caso que um `update({ status: "ATIVA" })` ingênuo erra: o restaurante
    // devia dois meses e pagou só o mais antigo. Ainda está 41 dias atrasado
    // no outro, e devolver a gestão aqui seria liberar quem não se acertou.
    outraEmAberto("2026-07-10T00:00:00Z");

    const res = await POST(...requisicao());
    const corpo = await res.json();

    expect(res.status).toBe(200);
    expect(corpo.assinatura.status).toBe("BLOQUEADA");
    // Já estava BLOQUEADA: nada a escrever, e nada que a devolva para ATIVA.
    expect(assinaturaUpdate).not.toHaveBeenCalled();
  });

  it("cai para INADIMPLENTE quando a que sobrou está entre 7 e 14 dias", async () => {
    // Pagar o mês antigo alivia sem quitar: sai do bloqueio, continua em
    // atraso. É a régua decidindo, não a rota.
    outraEmAberto("2026-08-10T00:00:00Z");

    const res = await POST(...requisicao());
    const corpo = await res.json();

    expect(assinaturaUpdate).toHaveBeenCalledTimes(1);
    expect(assinaturaUpdate.mock.calls[0][0].data).toMatchObject({
      status: "INADIMPLENTE",
    });
    expect(corpo.assinatura.status).toBe("INADIMPLENTE");
  });

  it("não mexe em assinatura CANCELADA", async () => {
    // Cancelamento é decisão humana; dar baixa numa fatura antiga não
    // recontrata ninguém.
    cobrancaFindUnique.mockResolvedValue(
      cobranca({ assinatura: { id: "assin-1", status: "CANCELADA" } })
    );

    const res = await POST(...requisicao());
    const corpo = await res.json();

    expect(res.status).toBe(200);
    expect(cobrancaUpdate).toHaveBeenCalledTimes(1);
    expect(assinaturaUpdate).not.toHaveBeenCalled();
    expect(corpo.assinatura.status).toBe("CANCELADA");
  });
});
