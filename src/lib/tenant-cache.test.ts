import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buscarTenantComCache, limparCacheDeTenants } from "./tenant-cache";

const TENANT = { id: "t1", status: "active", plano: "MEMBRO", assinatura: null };

beforeEach(() => {
  limparCacheDeTenants();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("buscarTenantComCache", () => {
  it("a segunda chamada dentro da janela não vai ao banco", async () => {
    const buscar = vi.fn().mockResolvedValue(TENANT);

    await buscarTenantComCache("pizzaria", buscar);
    await buscarTenantComCache("pizzaria", buscar);

    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("depois de 30 segundos consulta de novo: bloqueio e plano mudam em no máximo isso", async () => {
    const buscar = vi.fn().mockResolvedValue(TENANT);
    await buscarTenantComCache("pizzaria", buscar);

    vi.advanceTimersByTime(31_000);
    await buscarTenantComCache("pizzaria", buscar);

    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("cada restaurante tem a sua entrada", async () => {
    const buscar = vi.fn().mockResolvedValue(TENANT);
    await buscarTenantComCache("pizzaria", buscar);
    await buscarTenantComCache("hamburgueria", buscar);
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("restaurante que não existe é lembrado por poucos segundos, para um varredor de subdomínios não bater no banco a cada tentativa", async () => {
    const buscar = vi.fn().mockResolvedValue(null);

    await buscarTenantComCache("nao-existe", buscar);
    await buscarTenantComCache("nao-existe", buscar);
    expect(buscar).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(6_000);
    await buscarTenantComCache("nao-existe", buscar);
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("restaurante recém-criado aparece em poucos segundos mesmo se alguém o tentou antes", async () => {
    const buscar = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(TENANT);
    await buscarTenantComCache("novo", buscar);

    vi.advanceTimersByTime(6_000);

    expect(await buscarTenantComCache("novo", buscar)).toEqual(TENANT);
  });

  it("requisições simultâneas ao mesmo restaurante compartilham uma consulta só", async () => {
    let resolver!: (v: typeof TENANT) => void;
    const buscar = vi.fn().mockReturnValue(new Promise((r) => (resolver = r)));

    const a = buscarTenantComCache("pizzaria", buscar);
    const b = buscarTenantComCache("pizzaria", buscar);
    resolver(TENANT);

    expect(await a).toEqual(TENANT);
    expect(await b).toEqual(TENANT);
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("erro do banco não fica guardado: a próxima requisição tenta de novo", async () => {
    const buscar = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(TENANT);

    await expect(buscarTenantComCache("pizzaria", buscar)).rejects.toThrow("timeout");
    expect(await buscarTenantComCache("pizzaria", buscar)).toEqual(TENANT);
  });

  it("o cache não cresce sem limite", async () => {
    const buscar = vi.fn().mockResolvedValue(TENANT);
    for (let i = 0; i < 2000; i++) await buscarTenantComCache(`r${i}`, buscar);

    await buscarTenantComCache("r0", buscar);
    // r0 foi descartado pelo limite e consultado de novo
    expect(buscar.mock.calls.length).toBeGreaterThan(2000);
  });
});
