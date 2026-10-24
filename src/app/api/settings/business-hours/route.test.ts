import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "tenant-1";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const settingUpsert = vi.fn();
const settingFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    setting: {
      upsert: (...a: unknown[]) => settingUpsert(...a),
      findUnique: (...a: unknown[]) => settingFindUnique(...a),
    },
  },
}));

// unstable_cache é transparente aqui: o teste quer a leitura, não o cache. Os
// dois registram as chamadas para conferir a tag, que é por restaurante.
const unstableCache = vi.fn(
  <T extends (...args: never[]) => unknown>(fn: T, _chave: string[], _opcoes: unknown) => fn
);
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  unstable_cache: (...a: Parameters<typeof unstableCache>) => unstableCache(...a),
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
}));

import { PUT } from "./route";
import { DEFAULT_SCHEDULE, getBusinessHours } from "@/lib/business-hours";

function putReq(body: unknown) {
  return new NextRequest("http://localhost/api/settings/business-hours", {
    method: "PUT",
    headers: { "x-tenant-id": TENANT, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { role: "ADMIN" } });
  settingUpsert.mockResolvedValue({});
});

/**
 * Mesmo bug do cadastro do restaurante: `JSON.stringify(body)` sem validação,
 * e `as WeekSchedule` é cast de TypeScript, que não existe em runtime. Um corpo
 * vazio apagava a semana inteira e o cardápio passava a usar o horário padrão
 * como se fosse escolha do dono.
 */
describe("PUT /api/settings/business-hours", () => {
  it("grava a semana completa", async () => {
    const res = await PUT(putReq(DEFAULT_SCHEDULE));

    expect(res.status).toBe(200);
    expect(settingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: JSON.stringify(DEFAULT_SCHEDULE) } })
    );
  });

  it("recusa corpo vazio em vez de apagar a semana", async () => {
    const res = await PUT(putReq({}));

    expect(res.status).toBe(400);
    expect(settingUpsert).not.toHaveBeenCalled();
  });

  it("recusa semana sem todos os dias", async () => {
    const { sunday: _sunday, ...faltando } = DEFAULT_SCHEDULE;

    const res = await PUT(putReq(faltando));

    expect(res.status).toBe(400);
    expect(settingUpsert).not.toHaveBeenCalled();
  });

  it("recusa horário fora do formato HH:MM", async () => {
    const res = await PUT(
      putReq({ ...DEFAULT_SCHEDULE, monday: { open: true, from: "11h", to: "22:00" } })
    );

    expect(res.status).toBe(400);
    expect(settingUpsert).not.toHaveBeenCalled();
  });

  it("recusa 'open' que não é booleano", async () => {
    const res = await PUT(
      putReq({ ...DEFAULT_SCHEDULE, monday: { open: "sim", from: "11:00", to: "22:00" } })
    );

    expect(res.status).toBe(400);
    expect(settingUpsert).not.toHaveBeenCalled();
  });
});

describe("o cache do horário é por restaurante", () => {
  it("a leitura grava com chave e tag do próprio tenant", async () => {
    settingFindUnique.mockResolvedValue(null);
    await getBusinessHours(TENANT);

    const [, chave, opcoes] = unstableCache.mock.calls[0];
    expect(chave).toEqual(["business_hours", TENANT]);
    expect(opcoes).toMatchObject({ tags: [`business_hours:${TENANT}`] });
  });

  it("o PUT invalida só a tag do próprio tenant", async () => {
    await PUT(putReq(DEFAULT_SCHEDULE));
    expect(revalidateTag).toHaveBeenCalledWith(`business_hours:${TENANT}`, "max");
    expect(revalidateTag).not.toHaveBeenCalledWith("business_hours", expect.anything());
  });
});
