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

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  revalidateTag: vi.fn(),
}));

import { PUT } from "./route";
import { DEFAULT_SCHEDULE } from "@/lib/business-hours";

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
