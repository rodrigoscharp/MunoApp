import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const inscricaoFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    inscricao: { findUnique: (...a: unknown[]) => inscricaoFindUnique(...a) },
  },
}));

const temPagamento = vi.fn();
vi.mock("@/lib/assinatura/asaas", () => ({
  assinaturaTemPagamentoConfirmado: (...a: unknown[]) => temPagamento(...a),
}));

const provisionar = vi.fn();
vi.mock("@/lib/assinatura/provisionamento", () => ({
  provisionarInscricao: (...a: unknown[]) => provisionar(...a),
}));

vi.mock("@/lib/tenant-provisioning", () => ({
  buildTenantBaseUrl: (slug: string) => `https://${slug}.munoapp.com.br`,
}));

function requisicao(corpo: unknown, ip = "203.0.113.1"): NextRequest {
  return new NextRequest("http://localhost/api/assinar/reconciliar", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(corpo),
  });
}

async function rotaNova() {
  vi.resetModules();
  return (await import("@/app/api/assinar/reconciliar/route")).POST;
}

function inscricao(over: Record<string, unknown> = {}) {
  return {
    id: "insc-1",
    slug: "pizzaria",
    status: "AGUARDANDO_PAGAMENTO",
    asaasSubscriptionId: "sub_1",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  inscricaoFindUnique.mockResolvedValue(inscricao());
  temPagamento.mockResolvedValue(true);
  provisionar.mockResolvedValue({ tenantId: "tenant-1" });
});

// Fecha a janela entre pagar e ter o restaurante. O job diário é a rede de
// segurança e roda uma vez por dia; esta rota é o caminho rápido, disparado
// pela própria volta do cliente do gateway.
//
// O id na URL não autoriza nada: ele só diz QUAL inscrição verificar. Quem
// decide se provisiona é o Asaas, consultado deste lado. É por isso que
// receber um id de terceiros aqui é seguro.
describe("POST /api/assinar/reconciliar", () => {
  it("provisiona quando o Asaas confirma o pagamento, e devolve a URL do restaurante", async () => {
    const POST = await rotaNova();

    const res = await POST(requisicao({ inscricaoId: "insc-1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      provisionada: true,
      url: "https://pizzaria.munoapp.com.br",
    });
    expect(provisionar).toHaveBeenCalledWith(
      expect.objectContaining({ id: "insc-1" }),
      expect.objectContaining({ origem: "assinar/reconciliar" })
    );
  });

  // O webhook chegou primeiro — o caso comum. A página deve mostrar o mesmo
  // desfecho bom, sem tentar provisionar de novo.
  it("inscrição já provisionada devolve pronta, sem reprovisionar", async () => {
    inscricaoFindUnique.mockResolvedValue(inscricao({ status: "PROVISIONADA" }));
    const POST = await rotaNova();

    const res = await POST(requisicao({ inscricaoId: "insc-1" }));

    expect(await res.json()).toEqual({
      provisionada: true,
      url: "https://pizzaria.munoapp.com.br",
    });
    expect(provisionar).not.toHaveBeenCalled();
    expect(temPagamento).not.toHaveBeenCalled();
  });

  it("pagamento ainda não confirmado devolve que não está pronta", async () => {
    temPagamento.mockResolvedValue(false);
    const POST = await rotaNova();

    const res = await POST(requisicao({ inscricaoId: "insc-1" }));

    expect(await res.json()).toEqual({ provisionada: false });
    expect(provisionar).not.toHaveBeenCalled();
  });

  // Não confirma nem nega a existência do id: quem sondar ids não aprende
  // nada. E o desfecho para o cliente é o mesmo da página sem parâmetro.
  it("id desconhecido responde igual a pagamento não confirmado", async () => {
    inscricaoFindUnique.mockResolvedValue(null);
    const POST = await rotaNova();

    const res = await POST(requisicao({ inscricaoId: "nao-existe" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ provisionada: false });
  });

  it("corpo sem inscricaoId responde 400", async () => {
    const POST = await rotaNova();

    const res = await POST(requisicao({}));

    expect(res.status).toBe(400);
    expect(inscricaoFindUnique).not.toHaveBeenCalled();
  });

  // Rota pública que dispara consulta ao gateway: precisa de teto, senão vira
  // um amplificador contra o Asaas com uma requisição por chamada.
  it("barra com 429 ao estourar o teto do mesmo IP", async () => {
    const POST = await rotaNova();
    const ip = "198.51.100.4";

    for (let i = 0; i < 10; i++) {
      expect((await POST(requisicao({ inscricaoId: "insc-1" }, ip))).status).toBe(200);
    }
    const barrado = await POST(requisicao({ inscricaoId: "insc-1" }, ip));

    expect(barrado.status).toBe(429);
  });

  // Falha aqui não é o fim: o job diário ainda vai pegar. A página não pode
  // quebrar por causa disso.
  it("erro ao consultar o Asaas devolve não-pronta, sem estourar", async () => {
    temPagamento.mockRejectedValue(new Error("Asaas fora do ar"));
    const POST = await rotaNova();

    const res = await POST(requisicao({ inscricaoId: "insc-1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ provisionada: false });
  });
});
