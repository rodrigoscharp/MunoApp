/**
 * O assistente de pedidos.
 *
 * É a única rota do app cujo custo marginal não é CPU: cada chamada vira token
 * cobrado pela Groq. Por isso o rate limit vem **antes** de qualquer trabalho, e
 * por isso o cardápio é lido do banco em vez de aceito do corpo — antes ele
 * chegava pronto do navegador, e quem chamasse direto escolhia o texto de cada
 * "item", usando o prompt do restaurante como campo livre para o modelo.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const TENANT = "restaurante-a";

const menuItemFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { menuItem: { findMany: (...a: unknown[]) => menuItemFindMany(...a) } },
}));

import { POST } from "./route";

const fetchMock = vi.fn();

function req(body: unknown, ip = "1.1.1.1") {
  return new NextRequest("http://localhost/api/ai/menu-recommendation", {
    method: "POST",
    headers: {
      "x-tenant-id": TENANT,
      "x-forwarded-for": ip,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function respostaDaGroq(conteudo: unknown, ok = true) {
  return {
    ok,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(conteudo) } }],
    }),
  };
}

const cardapio = [
  { id: "item-1", name: "X-Salada", description: "com alface", price: 25, category: { name: "Lanches" } },
  { id: "item-2", name: "Suco", description: "laranja", price: 8, category: { name: "Bebidas" } },
];

/** Cada teste usa um IP novo: o limitador vive no escopo do módulo. */
let contador = 0;
const ipNovo = () => `10.0.0.${++contador}`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GROQ_API_KEY", "chave-de-teste");
  menuItemFindMany.mockResolvedValue(cardapio);
  fetchMock.mockResolvedValue(
    respostaDaGroq({ message: "Bora de X-Salada!", ids: ["item-1"] })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("porta de entrada", () => {
  it("recusa sem tenant resolvido", async () => {
    const semTenant = new NextRequest("http://localhost/api/ai/menu-recommendation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "oi" }),
    });
    const res = await POST(semTenant);

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["mensagem vazia", { message: "" }],
    ["mensagem longa demais", { message: "a".repeat(501) }],
    ["sem mensagem", {}],
    ["histórico grande demais", { message: "oi", history: Array(11).fill({ role: "user", content: "x" }) }],
    ["mensagem do histórico longa demais", { message: "oi", history: [{ role: "user", content: "a".repeat(2001) }] }],
    ["papel inexistente no histórico", { message: "oi", history: [{ role: "system", content: "x" }] }],
  ])("recusa %s sem chamar a IA", async (_nome, corpo) => {
    const res = await POST(req(corpo, ipNovo()));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("responde 500 quando a chave da Groq não está configurada", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const res = await POST(req({ message: "oi" }, ipNovo()));

    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa cardápio vazio antes de gastar token", async () => {
    menuItemFindMany.mockResolvedValue([]);
    const res = await POST(req({ message: "oi" }, ipNovo()));

    expect(res.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("o teto de chamadas por IP", () => {
  it("corta na 16ª chamada da mesma janela", async () => {
    const ip = ipNovo();

    for (let i = 0; i < 15; i++) {
      const res = await POST(req({ message: "oi" }, ip));
      expect(res.status, `chamada ${i + 1}`).toBe(200);
    }

    const bloqueada = await POST(req({ message: "oi" }, ip));
    expect(bloqueada.status).toBe(429);
  });

  it("bloqueia antes de gastar token na Groq", async () => {
    const ip = ipNovo();
    for (let i = 0; i < 15; i++) await POST(req({ message: "oi" }, ip));

    fetchMock.mockClear();
    await POST(req({ message: "oi" }, ip));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("conta por IP, não globalmente", async () => {
    const ipA = ipNovo();
    for (let i = 0; i < 15; i++) await POST(req({ message: "oi" }, ipA));

    const res = await POST(req({ message: "oi" }, ipNovo()));
    expect(res.status).toBe(200);
  });

  it("usa o primeiro IP da cadeia do X-Forwarded-For", async () => {
    const real = ipNovo();
    for (let i = 0; i < 15; i++) {
      await POST(req({ message: "oi" }, `${real}, 200.200.200.200`));
    }

    const res = await POST(req({ message: "oi" }, `${real}, 9.9.9.9`));
    expect(res.status).toBe(429);
  });
});

describe("o cardápio vem do banco", () => {
  it("lê só o que está disponível, com teto de itens", async () => {
    await POST(req({ message: "oi" }, ipNovo()));

    expect(menuItemFindMany.mock.calls[0][0]).toMatchObject({
      where: { available: true },
      take: 150,
    });
  });

  it("ignora um cardápio enviado no corpo da requisição", async () => {
    await POST(
      req(
        {
          message: "oi",
          menu: [{ id: "falso", name: "Item Inventado", price: 0.01 }],
        },
        ipNovo()
      )
    );

    const enviado = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(JSON.stringify(enviado.messages)).not.toContain("Item Inventado");
    expect(JSON.stringify(enviado.messages)).toContain("X-Salada");
  });
});

describe("a resposta do modelo não é confiada", () => {
  it("descarta id que não existe no cardápio", async () => {
    fetchMock.mockResolvedValue(
      respostaDaGroq({ message: "olha só", ids: ["item-1", "id-inventado"] })
    );

    const res = await POST(req({ message: "oi" }, ipNovo()));

    expect(await res.json()).toEqual({ text: "olha só", ids: ["item-1"] });
  });

  it("descarta id que não é string", async () => {
    fetchMock.mockResolvedValue(
      respostaDaGroq({ message: "olha", ids: [42, null, "item-2"] })
    );

    const res = await POST(req({ message: "oi" }, ipNovo()));
    expect((await res.json()).ids).toEqual(["item-2"]);
  });

  it("trata ids que não é lista como lista vazia", async () => {
    fetchMock.mockResolvedValue(respostaDaGroq({ message: "olha", ids: "item-1" }));

    const res = await POST(req({ message: "oi" }, ipNovo()));
    expect((await res.json()).ids).toEqual([]);
  });

  it("responde 500 quando o modelo devolve texto que não é JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "não é json" } }] }),
    });

    const res = await POST(req({ message: "oi" }, ipNovo()));
    expect(res.status).toBe(500);
  });

  it("responde 500 quando a Groq recusa a chamada", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "quota exceeded" } }),
    });

    const res = await POST(req({ message: "oi" }, ipNovo()));

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("quota exceeded");
  });

  it("responde 500 quando a rede cai, sem derrubar a rota", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const res = await POST(req({ message: "oi" }, ipNovo()));

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("ECONNRESET");
  });
});
