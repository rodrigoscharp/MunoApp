import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "tenant-1";
const TABLE_ID = "table-1";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const tableUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    table: {
      update: (...a: unknown[]) => tableUpdate(...a),
    },
  },
}));

import { PATCH } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/tables/table-1", {
    method: "PATCH",
    headers: { "x-tenant-id": TENANT, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: TABLE_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { role: "ADMIN" } });
  tableUpdate.mockResolvedValue({ id: TABLE_ID, posX: 0.42, posY: 0.75 });
});

describe("PATCH /api/tables/[id]", () => {
  it("persiste posX e posY quando enviados", async () => {
    const res = await PATCH(req({ posX: 0.42, posY: 0.75 }), params);

    expect(res.status).toBe(200);
    expect(tableUpdate).toHaveBeenCalledWith({
      where: { id: TABLE_ID },
      data: expect.objectContaining({ posX: 0.42, posY: 0.75 }),
    });
  });
});
