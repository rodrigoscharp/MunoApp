import { describe, expect, it, vi, beforeEach } from "vitest";

const queryRaw = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: { $queryRaw: (...a: unknown[]) => queryRaw(...a) },
}));

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/health", () => {
  it("200 quando o banco responde", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("503, sem detalhe do erro, quando o banco não responde", async () => {
    queryRaw.mockRejectedValue(new Error("password authentication failed for user postgres"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("password");
  });

  it("nunca é cacheado", async () => {
    queryRaw.mockResolvedValue([]);
    expect((await GET()).headers.get("Cache-Control")).toBe("no-store");
  });
});
