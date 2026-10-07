import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const create = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: { eventoSistema: { create: (...a: unknown[]) => create(...a) } },
}));

// O setup global mocka este módulo; aqui se testa o de verdade.
const { registrarSaude } = await vi.importActual<typeof import("./registrar")>("./registrar");

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  create.mockReset();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("registrarSaude", () => {
  it("grava origem, nível, mensagem, tenant e extra", async () => {
    create.mockResolvedValue({});
    await registrarSaude({
      origem: "webhook/asaas",
      nivel: "OK",
      mensagem: "PAYMENT_CONFIRMED processado",
      tenantId: "t1",
      extra: { inscricaoId: "i1", vazio: undefined },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        origem: "webhook/asaas",
        nivel: "OK",
        mensagem: "PAYMENT_CONFIRMED processado",
        tenantId: "t1",
        extra: { inscricaoId: "i1" },
      },
    });
  });

  it("mascara e-mail e corta a mensagem em 500 caracteres", async () => {
    create.mockResolvedValue({});
    await registrarSaude({ origem: "x", nivel: "ERRO", mensagem: `ana@pizzaria.com ${"a".repeat(600)}` });
    const { mensagem } = create.mock.calls[0][0].data;
    expect(mensagem).not.toContain("ana@pizzaria.com");
    expect(mensagem.length).toBe(500);
  });

  it("sem tenant e sem extra grava nulo", async () => {
    create.mockResolvedValue({});
    await registrarSaude({ origem: "x", nivel: "OK", mensagem: "m" });
    expect(create.mock.calls[0][0].data).toMatchObject({ tenantId: null, extra: undefined });
  });

  it("nunca lança quando o banco rejeita", async () => {
    create.mockRejectedValue(new Error("connection refused"));
    await expect(registrarSaude({ origem: "x", nivel: "ERRO", mensagem: "m" })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });

  it("desiste depois de 2 segundos, sem lançar", async () => {
    vi.useFakeTimers();
    create.mockReturnValue(new Promise(() => {}));
    const promessa = registrarSaude({ origem: "x", nivel: "ERRO", mensagem: "m" });
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promessa).resolves.toBeUndefined();
  });
});
