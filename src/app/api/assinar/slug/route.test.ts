import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// checarSlug NÃO é mockada: é lógica pura, com suíte própria em
// src/lib/inscricao/slug.test.ts. O que esta rota precisa isolar é o banco —
// e o limitador, que é estado de módulo e por isso exige reimportar a rota
// entre os testes que o exercitam.

const tenantFindUnique = vi.fn();
const inscricaoFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    tenant: { findUnique: (...args: unknown[]) => tenantFindUnique(...args) },
    inscricao: { findUnique: (...args: unknown[]) => inscricaoFindUnique(...args) },
  },
}));

function requisicao(slug: string | null, ip = "203.0.113.7"): NextRequest {
  const url = new URL("http://localhost/api/assinar/slug");
  if (slug !== null) url.searchParams.set("slug", slug);
  return new NextRequest(url, { headers: { "x-forwarded-for": ip } });
}

async function rotaNova() {
  vi.resetModules();
  return (await import("@/app/api/assinar/slug/route")).GET;
}

beforeEach(() => {
  vi.clearAllMocks();
  tenantFindUnique.mockResolvedValue(null);
  inscricaoFindUnique.mockResolvedValue(null);
});

describe("GET /api/assinar/slug", () => {
  it("responde livre quando não há tenant nem inscrição com o slug", async () => {
    const GET = await rotaNova();

    const res = await GET(requisicao("pizzaria-do-ze"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ livre: true });
  });

  // checarSlug exige slug JÁ normalizado e recusa maiúscula como INVALIDO
  // (ver o contrato no JSDoc dela). Se a rota parar de normalizar, o cliente
  // que digitar "Pizzaria" vê "endereço inválido" para um nome perfeitamente
  // válido — e o campo do checkout fica impossível de preencher.
  it("normaliza caixa e espaço das pontas antes de consultar", async () => {
    const GET = await rotaNova();

    await GET(requisicao("  Pizzaria-Do-Ze  "));

    expect(tenantFindUnique).toHaveBeenCalledWith({
      where: { slug: "pizzaria-do-ze" },
      select: { id: true },
    });
  });

  it("responde EM_USO quando já existe tenant com o slug", async () => {
    tenantFindUnique.mockResolvedValue({ id: "t1" });
    const GET = await rotaNova();

    const res = await GET(requisicao("pizzaria"));

    expect(await res.json()).toEqual({ livre: false, motivo: "EM_USO" });
  });

  // A inscrição reserva o slug antes do pagamento. Sem esta consulta, dois
  // clientes pagariam pelo mesmo endereço e o segundo descobriria no webhook.
  it("responde EM_USO quando o slug está reservado por uma inscrição em aberto", async () => {
    inscricaoFindUnique.mockResolvedValue({ id: "insc-1" });
    const GET = await rotaNova();

    const res = await GET(requisicao("pizzaria"));

    expect(await res.json()).toEqual({ livre: false, motivo: "EM_USO" });
  });

  // RESERVED_SLUGS chega aqui via validateSlug. "app" e "join" estão na lista
  // porque são hosts da plataforma — ver AGENTS.md, "A captação de lead".
  it.each(["app", "join"])(
    "%s responde RESERVADO, e sem consultar o banco",
    async (slug) => {
      const GET = await rotaNova();

      const res = await GET(requisicao(slug));

      expect(await res.json()).toEqual({ livre: false, motivo: "RESERVADO" });
      expect(tenantFindUnique).not.toHaveBeenCalled();
    }
  );

  // Endpoint público não consulta banco por causa de texto que nunca poderia
  // ser um slug: é o que separa uma checagem barata de um amplificador.
  it.each(["", "com espaço", "acentuação", "-comeca-com-hifen", "hifen--duplo"])(
    "%j é INVALIDO sem tocar no banco",
    async (slug) => {
      const GET = await rotaNova();

      const res = await GET(requisicao(slug));

      expect(await res.json()).toEqual({ livre: false, motivo: "INVALIDO" });
      expect(tenantFindUnique).not.toHaveBeenCalled();
    }
  );

  // Registrado porque surpreende: validateSlug usa ^[a-z0-9](-?[a-z0-9])*$,
  // sem comprimento mínimo, então um caractere passa e a.munoapp.com.br é um
  // endereço aceitável hoje. Não é bug — é ausência de regra. Se um dia se
  // decidir exigir mínimo, este teste é o que vai avisar que a decisão mudou.
  it("aceita slug de um caractere só — não há comprimento mínimo", async () => {
    const GET = await rotaNova();

    const res = await GET(requisicao("a"));

    expect(await res.json()).toEqual({ livre: true });
  });

  it("sem o parâmetro slug trata como vazio, em vez de quebrar", async () => {
    const GET = await rotaNova();

    const res = await GET(requisicao(null));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ livre: false, motivo: "INVALIDO" });
  });
});

describe("GET /api/assinar/slug — limitador", () => {
  // 60 por minuto porque o checkout consulta a cada tecla. É teto, não
  // enfeite: sem ele, uma rota pública sem autenticação vira sonda de
  // enumeração de quais restaurantes existem, uma consulta por requisição.
  it("barra com 429 ao estourar o teto do mesmo IP", async () => {
    const GET = await rotaNova();

    for (let i = 0; i < 60; i++) {
      const ok = await GET(requisicao("pizzaria-do-ze"));
      expect(ok.status).toBe(200);
    }

    const barrado = await GET(requisicao("pizzaria-do-ze"));

    expect(barrado.status).toBe(429);
    expect(await barrado.json()).toEqual({ error: "Muitas tentativas." });
  });

  it("o contador é por IP: outro cliente não herda o bloqueio do vizinho", async () => {
    const GET = await rotaNova();

    for (let i = 0; i < 61; i++) await GET(requisicao("pizzaria-do-ze", "198.51.100.1"));
    const outro = await GET(requisicao("pizzaria-do-ze", "198.51.100.2"));

    expect(outro.status).toBe(200);
  });

  // A Vercel sobrescreve X-Forwarded-For na borda, então o PRIMEIRO valor é o
  // IP real do cliente. Ler o último deixaria qualquer um escolher a própria
  // chave de limite mandando um header com vários IPs.
  it("usa o primeiro IP do x-forwarded-for, não o último", async () => {
    const GET = await rotaNova();

    for (let i = 0; i < 60; i++) {
      await GET(requisicao("pizzaria-do-ze", "203.0.113.9, 10.0.0.1"));
    }
    const mesmoCliente = await GET(requisicao("pizzaria-do-ze", "203.0.113.9, 10.0.0.2"));

    expect(mesmoCliente.status).toBe(429);
  });
});
