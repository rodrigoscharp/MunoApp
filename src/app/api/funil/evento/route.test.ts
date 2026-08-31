import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const upsert = vi.fn();
const create = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    sessaoFunil: { upsert: (...a: unknown[]) => upsert(...a) },
    eventoFunil: { create: (...a: unknown[]) => create(...a) },
  },
}));

const ORIGEM = "http://localhost:3000";
const SESSAO_VALIDA = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

function requisicao(corpo: unknown, opcoes: { origem?: string | null; cookie?: string | null } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  const origem = opcoes.origem === undefined ? ORIGEM : opcoes.origem;
  if (origem) headers.set("origin", origem);
  const cookie = opcoes.cookie === undefined ? `muno_s=${SESSAO_VALIDA}` : opcoes.cookie;
  if (cookie) headers.set("cookie", cookie);

  return new NextRequest(`${ORIGEM}/api/funil/evento`, {
    method: "POST",
    headers,
    body: JSON.stringify(corpo),
  });
}

describe("POST /api/funil/evento", () => {
  beforeEach(() => {
    vi.resetModules();
    upsert.mockReset().mockResolvedValue({ id: SESSAO_VALIDA });
    create.mockReset().mockResolvedValue({});
  });

  async function post(...args: Parameters<typeof requisicao>) {
    const { POST } = await import("./route");
    return POST(requisicao(...args));
  }

  it("grava o evento e responde 204", async () => {
    const res = await post({ tipo: "VIU_PRECO" });

    expect(res.status).toBe(204);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessaoId: SESSAO_VALIDA, tipo: "VIU_PRECO" }),
      })
    );
  });

  // Evento sem sessão não tem para onde ir, e criar sessão a partir do corpo
  // deixaria a tabela aberta para qualquer um inventar id. 204 e não 400: o
  // navegador que bloqueia cookie não fez nada de errado.
  it("sem cookie, não grava nada", async () => {
    const res = await post({ tipo: "VISITA" }, { cookie: null });

    expect(res.status).toBe(204);
    expect(create).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  // O cookie é controlado pelo cliente e vira chave primária de SessaoFunil
  // sem passar por lugar nenhum. Um valor forjado precisa seguir o mesmo
  // caminho de "sem cookie", não virar linha nova na tabela.
  it("cookie com formato inválido não grava sessão nenhuma", async () => {
    const res = await post({ tipo: "VISITA" }, { cookie: "muno_s=qualquer-coisa" });

    expect(res.status).toBe(204);
    expect(create).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("recusa origem fora da lista", async () => {
    const res = await post({ tipo: "VISITA" }, { origem: "https://invasor.com" });

    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  // O enum é seguro aqui, ao contrário de Lead.plano: emissor e receptor são
  // publicados no mesmo deploy, então um valor novo nunca chega sozinho.
  it("recusa tipo desconhecido", async () => {
    const res = await post({ tipo: "COMPROU_UM_CARRO" });

    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  // Atribuição de primeiro toque: o anúncio que trouxe a pessoa é quem pagou
  // pela visita, e uma volta digitando o endereço não pode roubar o crédito.
  it("não sobrescreve o utm de uma sessão que já existe", async () => {
    await post({
      tipo: "VISITA",
      utm: { source: "google" },
      referrer: "google.com",
      dispositivo: "desktop",
    });

    const args = upsert.mock.calls[0][0];
    expect(args.create).toMatchObject({ id: SESSAO_VALIDA, utmSource: "google" });
    expect(args.update).toEqual({});
  });

  it("corta detalhe longo demais em vez de recusar o evento", async () => {
    await post({ tipo: "CHECKOUT_PASSO", detalhe: "x".repeat(200) });

    const { detalhe } = create.mock.calls[0][0].data;
    expect(detalhe).toHaveLength(60);
  });
});
