/**
 * O webhook do gateway é a única porta por onde "foi pago" entra no sistema, e
 * ela é pública: o tenantId está na URL e não autentica nada. Quem autentica é a
 * assinatura, verificada dentro do adapter com o segredo daquele lojista.
 *
 * Três coisas precisam continuar verdadeiras aqui, e nenhuma delas aparece no
 * caminho feliz:
 *   1. assinatura inválida não muda pedido nenhum;
 *   2. falha genérica responde 500, nunca 200 — dizer "received" ao gateway
 *      cancela a fila de reentrega e esconde o problema;
 *   3. a escrita do pedido acontece dentro do contexto do tenant da URL.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { InvalidWebhookSignatureError } from "@/lib/payments/types";

const TENANT = "restaurante-a";
const PROVIDER = "stripe";

const connectionFindUnique = vi.fn();
const connectionUpdate = vi.fn();
const orderUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { order: { update: (...a: unknown[]) => orderUpdate(...a) } },
  prismaUnscoped: {
    paymentConnection: {
      findUnique: (...a: unknown[]) => connectionFindUnique(...a),
      update: (...a: unknown[]) => connectionUpdate(...a),
    },
  },
}));

const handleWebhook = vi.fn();
vi.mock("@/lib/payments/factory", () => ({
  getPaymentProvider: () => ({ handleWebhook: (...a: unknown[]) => handleWebhook(...a) }),
}));

const broadcastOrderUpdate = vi.fn();
vi.mock("@/lib/realtime", () => ({
  broadcastOrderUpdate: (...a: unknown[]) => broadcastOrderUpdate(...a),
  broadcastTenantEvent: vi.fn(),
}));

// O contexto de tenant é real: é ele que o teste quer observar.
import { getCurrentTenantId } from "@/lib/tenant-context";
import { POST, GET } from "./route";

const params = { params: Promise.resolve({ provider: PROVIDER, tenantId: TENANT }) };

function req(corpo = '{"evento":"pago"}') {
  return new NextRequest(`http://localhost/api/payments/webhook/${PROVIDER}/${TENANT}`, {
    method: "POST",
    headers: { "stripe-signature": "assinatura" },
    body: corpo,
  });
}

const conexao = { id: "conn-1", provider: PROVIDER, tenantId: TENANT };

beforeEach(() => {
  vi.clearAllMocks();
  connectionFindUnique.mockResolvedValue(conexao);
  connectionUpdate.mockResolvedValue(conexao);
  orderUpdate.mockResolvedValue({ id: "pedido-1", status: "CONFIRMED" });
  handleWebhook.mockResolvedValue({
    orderId: "pedido-1",
    status: "approved",
    providerPaymentId: "pay_123",
  });
});

describe("validação da URL pelo gateway", () => {
  it("responde ok no GET", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("antes de confiar no evento", () => {
  it("procura a conexão pelo par tenant + provider da URL", async () => {
    await POST(req(), params);
    expect(connectionFindUnique).toHaveBeenCalledWith({
      where: { tenantId_provider: { tenantId: TENANT, provider: PROVIDER } },
    });
  });

  it("responde received sem revelar que o tenant não existe", async () => {
    connectionFindUnique.mockResolvedValue(null);
    const res = await POST(req(), params);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("entrega ao adapter o corpo cru, byte a byte", async () => {
    // Re-serializar um objeto parseado muda os bytes e invalida a assinatura
    // de Stripe e Abacate Pay.
    const cru = '{"id":"evt_1",  "espaco":"preservado"}';
    await POST(req(cru), params);
    expect(handleWebhook.mock.calls[0][0]).toBe(cru);
  });

  it("recusa assinatura inválida com 401 e não toca no pedido", async () => {
    handleWebhook.mockRejectedValue(new InvalidWebhookSignatureError());
    const res = await POST(req(), params);

    expect(res.status).toBe(401);
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(connectionUpdate).not.toHaveBeenCalled();
    expect(broadcastOrderUpdate).not.toHaveBeenCalled();
  });

  it("ignora evento que o adapter não reconhece como relevante", async () => {
    handleWebhook.mockResolvedValue(null);
    const res = await POST(req(), params);

    expect(res.status).toBe(200);
    expect(orderUpdate).not.toHaveBeenCalled();
  });
});

describe("o que cada status grava no pedido", () => {
  it("approved marca pago, confirma e guarda o id do gateway", async () => {
    await POST(req(), params);

    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: "pedido-1" },
      data: { paymentStatus: "PAID", status: "CONFIRMED", mpPaymentId: "pay_123" },
    });
  });

  it.each(["rejected", "cancelled"])("%s volta o pagamento para UNPAID", async (status) => {
    handleWebhook.mockResolvedValue({ orderId: "pedido-1", status });
    await POST(req(), params);

    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: "pedido-1" },
      data: { paymentStatus: "UNPAID" },
    });
  });

  it("rejected não cancela nem despromove o status do pedido", async () => {
    // A cozinha pode já ter começado. Quem decide cancelar é o lojista.
    handleWebhook.mockResolvedValue({ orderId: "pedido-1", status: "rejected" });
    await POST(req(), params);

    expect(orderUpdate.mock.calls[0][0].data).not.toHaveProperty("status");
  });

  it("refunded marca REFUNDED", async () => {
    handleWebhook.mockResolvedValue({ orderId: "pedido-1", status: "refunded" });
    await POST(req(), params);

    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: "pedido-1" },
      data: { paymentStatus: "REFUNDED" },
    });
  });

  it("status desconhecido não grava nada e não avisa ninguém", async () => {
    handleWebhook.mockResolvedValue({ orderId: "pedido-1", status: "pending" });
    const res = await POST(req(), params);

    expect(res.status).toBe(200);
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(broadcastOrderUpdate).not.toHaveBeenCalled();
  });
});

describe("escopo de tenant", () => {
  it("escreve o pedido dentro do contexto do tenant da URL", async () => {
    // Sem isto, a notificação de um restaurante poderia alcançar o pedido de
    // outro — o id do pedido é global e a extensão do Prisma só escopa dentro
    // de runWithTenant.
    let tenantVisto: string | undefined;
    orderUpdate.mockImplementation(async () => {
      tenantVisto = getCurrentTenantId();
      return { id: "pedido-1" };
    });

    await POST(req(), params);

    expect(tenantVisto).toBe(TENANT);
  });

  it("carimba lastCheckedAt na conexão depois da assinatura conferir", async () => {
    await POST(req(), params);
    expect(connectionUpdate).toHaveBeenCalledWith({
      where: { id: "conn-1" },
      data: { lastCheckedAt: expect.any(Date) },
    });
  });

  it("avisa o acompanhamento do pedido atualizado", async () => {
    const pedido = { id: "pedido-1", status: "CONFIRMED" };
    orderUpdate.mockResolvedValue(pedido);

    await POST(req(), params);

    expect(broadcastOrderUpdate).toHaveBeenCalledWith(TENANT, pedido);
  });
});

describe("falha genérica não pode virar 200", () => {
  it("responde 500 quando a escrita do pedido falha", async () => {
    orderUpdate.mockRejectedValue(new Error("connection terminated"));
    const res = await POST(req(), params);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Webhook error" });
  });

  it("responde 500 quando as credenciais não descriptografam", async () => {
    // Chave de criptografia rotacionada faz decryptCredentials lançar Error
    // comum, não InvalidWebhookSignatureError.
    handleWebhook.mockRejectedValue(new Error("bad decrypt"));
    const res = await POST(req(), params);

    expect(res.status).toBe(500);
  });

  it("responde 500 quando a busca da conexão falha", async () => {
    connectionFindUnique.mockRejectedValue(new Error("timeout"));
    const res = await POST(req(), params);

    expect(res.status).toBe(500);
  });
});
