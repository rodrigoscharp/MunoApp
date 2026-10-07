import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A tela de saúde precisa abrir justamente quando algo está quebrado, então uma
// leitura que falha vira texto na tela. O que este teste trava é o outro lado:
// a falha também vai para o log, só com a classe do erro (a mensagem do Prisma
// pode trazer SQL).

vi.mock("@/lib/auth-platform", () => ({
  authPlatform: vi.fn().mockResolvedValue({ user: { id: "p1" } }),
}));

vi.mock("@/lib/saude/coletar", () => ({
  coletarDadosDeSaude: vi.fn().mockResolvedValue({ banco: { ok: true, ms: 3 }, leitura: null }),
  coletarPedidosPorHora: vi.fn(),
  listarEventos: vi.fn(),
}));

import { coletarPedidosPorHora, listarEventos } from "@/lib/saude/coletar";
import SaudePage from "./page";

const pedidos = vi.mocked(coletarPedidosPorHora);
const eventos = vi.mocked(listarEventos);

class ErroDoPrisma extends Error {
  constructor() {
    super('column "nivel" does not exist: select * from "EventoSistema"');
    this.name = "PrismaClientKnownRequestError";
  }
}

let erro: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  erro = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  erro.mockRestore();
  vi.clearAllMocks();
});

describe("SaudePage", () => {
  it("registra no log as duas leituras que falham, só com o nome do erro, e ainda devolve a tela", async () => {
    pedidos.mockRejectedValue(new ErroDoPrisma());
    eventos.mockRejectedValue(new ErroDoPrisma());

    const tela = await SaudePage({ searchParams: Promise.resolve({}) });

    expect(tela).toBeTruthy();
    expect(erro).toHaveBeenCalledWith("[saude] pedidos por hora falhou", "PrismaClientKnownRequestError");
    expect(erro).toHaveBeenCalledWith("[saude] feed de eventos falhou", "PrismaClientKnownRequestError");
    // Nada da mensagem (que pode ecoar SQL) chega ao log.
    expect(JSON.stringify(erro.mock.calls)).not.toContain("EventoSistema");
  });

  it("usa um nome genérico quando o que foi lançado não é um Error", async () => {
    pedidos.mockRejectedValue("quebrou");
    eventos.mockResolvedValue([]);

    await SaudePage({ searchParams: Promise.resolve({}) });

    expect(erro).toHaveBeenCalledWith("[saude] pedidos por hora falhou", "erro");
    expect(erro).toHaveBeenCalledTimes(1);
  });

  it("não escreve nada no log quando as leituras funcionam", async () => {
    pedidos.mockResolvedValue([]);
    eventos.mockResolvedValue([]);

    await SaudePage({ searchParams: Promise.resolve({}) });

    expect(erro).not.toHaveBeenCalled();
  });
});
