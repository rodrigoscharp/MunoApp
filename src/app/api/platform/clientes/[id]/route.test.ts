import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- mocks -----------------------------------------------------------------

const authPlatform = vi.fn();
vi.mock("@/lib/auth-platform", () => ({ authPlatform: () => authPlatform() }));

const assinaturaFindUnique = vi.fn();
const assinaturaCreate = vi.fn();
const assinaturaUpdate = vi.fn();
const tenantFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    assinatura: {
      findUnique: (...a: unknown[]) => assinaturaFindUnique(...a),
      create: (...a: unknown[]) => assinaturaCreate(...a),
      update: (...a: unknown[]) => assinaturaUpdate(...a),
    },
    tenant: { findUnique: (...a: unknown[]) => tenantFindUnique(...a) },
  },
}));

const { PATCH } = await import("@/app/api/platform/clientes/[id]/route");

// --- helpers ---------------------------------------------------------------

function requisicao(body: unknown): NextRequest {
  return new NextRequest("http://admin.localhost/api/platform/clientes/t1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "t1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  authPlatform.mockResolvedValue({ user: { id: "admin-1" } });
  tenantFindUnique.mockResolvedValue({ id: "t1" });
  assinaturaCreate.mockImplementation(async (a: { data: unknown }) => a.data);
  assinaturaUpdate.mockImplementation(async (a: { data: unknown }) => a.data);
});

// --- testes ----------------------------------------------------------------

/**
 * Esta rota é o TERCEIRO caminho que cria assinatura, e foi o último a receber
 * a correção do inicioCobranca no passado — o backfill da migração e a
 * conversão de lead já a tinham. O defeito é silencioso e caro: o cliente
 * nasce vencido, o job diário gera a cobrança, e a régua o bloqueia em duas
 * semanas por uma fatura que ninguém enviou.
 *
 * Só reproduz em parte do mês: com vencimento dia 25 e hoje dia 20 a data cai
 * no futuro por acaso, e o bug some. Por isso o teste varre os 28 dias.
 */
describe("PATCH /api/platform/clientes/[id] — inicioCobranca nunca no passado", () => {
  it("ao criar assinatura, qualquer dia de vencimento gera data futura", async () => {
    for (let dia = 1; dia <= 28; dia++) {
      assinaturaFindUnique.mockResolvedValue(null);
      const antes = Date.now();

      await PATCH(requisicao({ valorMensal: 99.9, diaVencimento: dia }), params);

      const criada = assinaturaCreate.mock.calls.at(-1)![0].data;
      expect(
        criada.inicioCobranca.getTime(),
        `vencimento dia ${dia} nasceu no passado`
      ).toBeGreaterThan(antes);
    }
  });

  it("ao reativar uma cancelada, recomeça o relógio", async () => {
    // Assinatura cancelada meses atrás: o inicioCobranca antigo já passou.
    // Voltar para ATIVA sem mexer nele faria o job cobrar retroativo —
    // recontratado hoje, inadimplente amanhã.
    assinaturaFindUnique.mockResolvedValue({
      status: "CANCELADA",
      diaVencimento: 10,
      inicioCobranca: new Date("2025-01-10T00:00:00Z"),
    });
    const antes = Date.now();

    await PATCH(requisicao({ valorMensal: 120 }), params);

    const dados = assinaturaUpdate.mock.calls.at(-1)![0].data;
    expect(dados.status).toBe("ATIVA");
    expect(dados.inicioCobranca.getTime()).toBeGreaterThan(antes);
  });

  it("não mexe no inicioCobranca de quem não estava cancelado", async () => {
    // INADIMPLENTE e BLOQUEADA são da régua. Reiniciar o relógio aqui apagaria
    // um atraso que ninguém pagou.
    assinaturaFindUnique.mockResolvedValue({
      status: "INADIMPLENTE",
      diaVencimento: 10,
      inicioCobranca: new Date("2026-01-10T00:00:00Z"),
    });

    await PATCH(requisicao({ valorMensal: 120 }), params);

    const dados = assinaturaUpdate.mock.calls.at(-1)![0].data;
    expect(dados).not.toHaveProperty("inicioCobranca");
    expect(dados).not.toHaveProperty("status");
  });

  it("recusa sem sessão de plataforma", async () => {
    authPlatform.mockResolvedValue(null);

    const res = await PATCH(requisicao({ valorMensal: 99.9 }), params);

    expect(res.status).toBe(401);
    expect(assinaturaCreate).not.toHaveBeenCalled();
    expect(assinaturaUpdate).not.toHaveBeenCalled();
  });
});
