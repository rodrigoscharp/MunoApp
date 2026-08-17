import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "tenant-1";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const findUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    setting: {
      findUnique: (...a: unknown[]) => findUnique(...a),
    },
  },
}));

import { GET } from "./route";

function req() {
  return new NextRequest("http://localhost/api/settings/restaurant", {
    headers: { "x-tenant-id": TENANT },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/settings/restaurant", () => {
  it("preenche com os defaults quando o tenant não tem Setting salvo", async () => {
    findUnique.mockResolvedValue(null);

    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({
      name: "Muno Food Restaurante",
      logoUrl: "/munowbg.png",
      floorPlanImageUrl: null,
    });
  });

  it("preenche os campos ausentes de um Setting salvo parcial com os defaults", async () => {
    findUnique.mockResolvedValue({ value: JSON.stringify({ floorPlanImageUrl: "https://cdn/planta.png" }) });

    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({
      name: "Muno Food Restaurante",
      logoUrl: "/munowbg.png",
      floorPlanImageUrl: "https://cdn/planta.png",
    });
  });
});
