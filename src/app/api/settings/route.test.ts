/**
 * O tempo estimado de entrega, que POST /api/orders usa para calcular o
 * `estimatedDeliveryAt` de todo pedido.
 *
 * A rota lê o corpo com `await req.json() as { minutes: number }` — o mesmo cast
 * de TypeScript que já tinha sido bug em business-hours.ts, onde um corpo `{}`
 * passava e apagava a semana inteira. Aqui a checagem de runtime existe para o
 * valor, mas o corpo em si ainda não é validado.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "restaurante-a";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const settingFindUnique = vi.fn();
const settingUpsert = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    setting: {
      findUnique: (...a: unknown[]) => settingFindUnique(...a),
      upsert: (...a: unknown[]) => settingUpsert(...a),
    },
  },
}));

import { GET, PUT } from "./route";

function req(method: string, body?: unknown, comTenant = true) {
  return new NextRequest("http://localhost/api/settings", {
    method,
    headers: {
      ...(comTenant ? { "x-tenant-id": TENANT } : {}),
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  settingFindUnique.mockResolvedValue(null);
  settingUpsert.mockResolvedValue({ value: "60" });
});

describe("GET — o tempo que o cardápio mostra", () => {
  it("recusa sem tenant resolvido", async () => {
    const res = await GET(req("GET", undefined, false));
    expect(res.status).toBe(400);
  });

  it("não exige login: o cliente vê a previsão antes de pedir", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
  });

  it("cai em 45 minutos quando o dono nunca configurou", async () => {
    const res = await GET(req("GET"));
    expect(await res.json()).toEqual({ minutes: 45 });
  });

  it("devolve o valor gravado", async () => {
    settingFindUnique.mockResolvedValue({ value: "70" });
    const res = await GET(req("GET"));
    expect(await res.json()).toEqual({ minutes: 70 });
  });

  it("busca a configuração do tenant da request", async () => {
    await GET(req("GET"));
    expect(settingFindUnique).toHaveBeenCalledWith({
      where: { tenantId_key: { tenantId: TENANT, key: "delivery_time_minutes" } },
    });
  });
});

describe("PUT — autorização", () => {
  it("recusa visitante sem sessão", async () => {
    auth.mockResolvedValue(null);
    const res = await PUT(req("PUT", { minutes: 60 }));

    expect(res.status).toBe(401);
    expect(settingUpsert).not.toHaveBeenCalled();
  });

  it.each(["CUSTOMER", "KITCHEN", "MOTOBOY"])("recusa role %s", async (role) => {
    auth.mockResolvedValue({ user: { id: "u", role } });
    const res = await PUT(req("PUT", { minutes: 60 }));

    expect(res.status).toBe(401);
    expect(settingUpsert).not.toHaveBeenCalled();
  });
});

describe("PUT — o valor aceito", () => {
  it("grava dentro da faixa", async () => {
    const res = await PUT(req("PUT", { minutes: 60 }));

    expect(res.status).toBe(200);
    expect(settingUpsert).toHaveBeenCalledWith({
      where: { tenantId_key: { tenantId: TENANT, key: "delivery_time_minutes" } },
      update: { value: "60" },
      create: { tenantId: TENANT, key: "delivery_time_minutes", value: "60" },
    });
  });

  it.each([
    ["abaixo do mínimo", 4],
    ["acima do máximo", 181],
    ["zero", 0],
    ["negativo", -10],
  ])("recusa %s", async (_nome, minutes) => {
    const res = await PUT(req("PUT", { minutes }));

    expect(res.status).toBe(400);
    expect(settingUpsert).not.toHaveBeenCalled();
  });

  it.each([
    ["texto", "60"],
    ["nulo", null],
    ["objeto", { valor: 60 }],
  ])("recusa minutes do tipo %s", async (_nome, minutes) => {
    const res = await PUT(req("PUT", { minutes }));

    expect(res.status).toBe(400);
    expect(settingUpsert).not.toHaveBeenCalled();
  });

  it("aceita os extremos da faixa", async () => {
    for (const minutes of [5, 180]) {
      settingUpsert.mockClear();
      const res = await PUT(req("PUT", { minutes }));
      expect(res.status, `minutes ${minutes}`).toBe(200);
    }
  });

  it("recusa corpo que não é objeto, com 400 e não 500", async () => {
    // `const { minutes } = await req.json() as {...}` estoura ao desestruturar
    // null — o cast não existe em runtime.
    const res = await PUT(req("PUT", null));

    expect(res.status).toBe(400);
    expect(settingUpsert).not.toHaveBeenCalled();
  });

  it("recusa minutos fracionados, que o parseInt truncaria na volta", async () => {
    const res = await PUT(req("PUT", { minutes: 45.7 }));
    expect(res.status).toBe(400);
  });
});
