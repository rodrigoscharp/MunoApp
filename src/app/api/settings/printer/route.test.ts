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

import { PUT } from "./route";

function putReq(body: unknown) {
  return new NextRequest("http://localhost/api/settings/printer", {
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

describe("PUT /api/settings/printer", () => {
  it("grava a configuração da impressora", async () => {
    const config = { enabled: true, paperWidth: "58mm" };

    const res = await PUT(putReq(config));

    expect(res.status).toBe(200);
    expect(settingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: JSON.stringify(config) } })
    );
  });

  it("recusa corpo vazio", async () => {
    const res = await PUT(putReq({}));

    expect(res.status).toBe(400);
    expect(settingUpsert).not.toHaveBeenCalled();
  });

  // A largura vira comando de impressão: um valor fora da lista quebra o cupom
  // no balcão, e o erro só aparece na hora de imprimir.
  it("recusa largura de papel desconhecida", async () => {
    const res = await PUT(putReq({ enabled: true, paperWidth: "70mm" }));

    expect(res.status).toBe(400);
    expect(settingUpsert).not.toHaveBeenCalled();
  });

  it("recusa 'enabled' que não é booleano", async () => {
    const res = await PUT(putReq({ enabled: "sim", paperWidth: "80mm" }));

    expect(res.status).toBe(400);
    expect(settingUpsert).not.toHaveBeenCalled();
  });
});
