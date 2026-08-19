import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "tenant-1";
const MOTOBOY_ID = "user-motoboy";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const userFindFirst = vi.fn();
const userUpdate = vi.fn();
const userDelete = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: (...a: unknown[]) => userFindFirst(...a),
      update: (...a: unknown[]) => userUpdate(...a),
      delete: (...a: unknown[]) => userDelete(...a),
    },
  },
}));

import { PATCH, DELETE } from "./route";

function req(method: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/users/motoboys/${MOTOBOY_ID}`, {
    method,
    headers: { "x-tenant-id": TENANT, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const params = { params: Promise.resolve({ id: MOTOBOY_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { role: "ADMIN" } });
  userFindFirst.mockResolvedValue({ id: MOTOBOY_ID });
  userUpdate.mockResolvedValue({ id: MOTOBOY_ID, name: "Motoboy", email: "m@x.com" });
  userDelete.mockResolvedValue({ id: MOTOBOY_ID });
});

describe("PATCH /api/users/motoboys/[id]", () => {
  it("troca a senha quando o alvo é um motoboy", async () => {
    const res = await PATCH(req("PATCH", { password: "novasenha" }), params);

    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MOTOBOY_ID } })
    );
  });

  // A rota se chama "motoboys", mas o where só levava o id: um CUSTOMER do
  // mesmo restaurante entrava por aqui e o dono trocava a senha dele.
  it("não toca em usuário que não é motoboy", async () => {
    userFindFirst.mockResolvedValue(null);

    const res = await PATCH(req("PATCH", { password: "invadido123" }), params);

    expect(res.status).toBe(404);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("escopa a busca do alvo por papel", async () => {
    await PATCH(req("PATCH", { password: "novasenha" }), params);

    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MOTOBOY_ID, role: "MOTOBOY" } })
    );
  });
});

describe("DELETE /api/users/motoboys/[id]", () => {
  it("apaga quando o alvo é um motoboy", async () => {
    const res = await DELETE(req("DELETE"), params);

    expect(res.status).toBe(200);
    expect(userDelete).toHaveBeenCalledWith({ where: { id: MOTOBOY_ID } });
  });

  it("não apaga usuário que não é motoboy", async () => {
    userFindFirst.mockResolvedValue(null);

    const res = await DELETE(req("DELETE"), params);

    expect(res.status).toBe(404);
    expect(userDelete).not.toHaveBeenCalled();
  });

  // Antes subia P2025 do Prisma e o handler genérico devolvia 500.
  it("devolve 404 para motoboy inexistente", async () => {
    userFindFirst.mockResolvedValue(null);

    const res = await DELETE(req("DELETE"), params);

    expect(res.status).toBe(404);
  });
});
