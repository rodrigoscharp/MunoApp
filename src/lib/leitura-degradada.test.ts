/**
 * Perfil do restaurante e horário de funcionamento leem o banco por dentro de
 * um unstable_cache. Uma falha de banco precisa sair do cache como exceção e
 * só virar o valor padrão do lado de fora: tratada lá dentro, o padrão era
 * guardado por 60s e o cabeçalho ficava sem nome, ou a casa com o horário
 * errado, um minuto depois de o banco ter voltado.
 *
 * O unstable_cache aqui é um repasse que registra se a função cacheada lançou.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueTenant, findUniqueSetting, reportarErro, lancouNoCache } = vi.hoisted(() => ({
  findUniqueTenant: vi.fn(),
  findUniqueSetting: vi.fn(),
  reportarErro: vi.fn(async () => {}),
  lancouNoCache: { valor: false },
}));

vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: () => Promise<unknown>) =>
    async () => {
      try {
        return await fn();
      } catch (erro) {
        lancouNoCache.valor = true;
        throw erro;
      }
    },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: findUniqueTenant },
    setting: { findUnique: findUniqueSetting },
  },
}));
vi.mock("@/lib/observabilidade", () => ({ reportarErro }));

import { getRestaurantInfo } from "@/lib/restaurant";
import { getBusinessHours, DEFAULT_SCHEDULE } from "@/lib/business-hours";

beforeEach(() => {
  vi.clearAllMocks();
  lancouNoCache.valor = false;
});

describe("getRestaurantInfo", () => {
  it("falha de banco não entra no cache: lança lá dentro, degrada fora e avisa", async () => {
    findUniqueTenant.mockRejectedValue(new Error("banco fora"));
    findUniqueSetting.mockResolvedValue(null);

    const info = await getRestaurantInfo("t1");

    expect(lancouNoCache.valor).toBe(true);
    expect(info.name).toBe("");
    expect(reportarErro).toHaveBeenCalledWith(
      expect.objectContaining({ origem: "restaurante/leitura", extra: { tenantId: "t1" } })
    );
  });

  it("com o banco de pé, lê o nome e o cadastro", async () => {
    findUniqueTenant.mockResolvedValue({ nome: "Pizzaria" });
    findUniqueSetting.mockResolvedValue({ value: JSON.stringify({ phone: "11" }) });

    const info = await getRestaurantInfo("t1");

    expect(info).toMatchObject({ name: "Pizzaria", phone: "11" });
    expect(reportarErro).not.toHaveBeenCalled();
  });
});

describe("getBusinessHours", () => {
  it("falha de banco não entra no cache: lança lá dentro, degrada fora e avisa", async () => {
    findUniqueSetting.mockRejectedValue(new Error("banco fora"));

    const horario = await getBusinessHours("t1");

    expect(lancouNoCache.valor).toBe(true);
    expect(horario).toEqual(DEFAULT_SCHEDULE);
    expect(reportarErro).toHaveBeenCalledWith(
      expect.objectContaining({ origem: "horario/leitura" })
    );
  });

  it("JSON corrompido é dado, não falha: devolve o padrão sem lançar", async () => {
    findUniqueSetting.mockResolvedValue({ value: "{quebrado" });

    expect(await getBusinessHours("t1")).toEqual(DEFAULT_SCHEDULE);
    expect(lancouNoCache.valor).toBe(false);
  });
});
