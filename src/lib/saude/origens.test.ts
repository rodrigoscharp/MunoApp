import { describe, expect, it } from "vitest";
import { classificarOrigem } from "./origens";

describe("classificarOrigem", () => {
  it.each([
    // E-mail vem antes do webhook: a falha de boas-vindas do webhook é de e-mail.
    ["webhook/asaas:boas-vindas", "email"],
    ["cron/reconciliacao:boas-vindas", "email"],
    ["assinar/reconciliar:boas-vindas", "email"],
    ["forgot-password:envio", "email"],
    ["webhook/asaas", "webhook-asaas"],
    ["webhook/asaas:pagamento-sem-inscricao", "webhook-asaas"],
    ["route:/api/assinaturas/webhook/asaas", "webhook-asaas"],
    ["webhook/pagamento", "pagamentos"],
    ["webhook/pagamento:valor-menor", "pagamentos"],
    ["route:/api/payments/webhook/[provider]/[tenantId]", "pagamentos"],
    ["cron/assinaturas", "cron"],
    ["cron/assinaturas:faxina", "cron"],
    ["cron/reconciliacao-cobrancas", "cron"],
    ["route:/api/cron/assinaturas", "cron"],
    ["route:/api/orders/[id]", "rotas"],
    ["render:/adm/menu", "rotas"],
    ["action:/adm/restaurante", "rotas"],
    ["proxy:/", "rotas"],
  ])("%s é %s", (origem, peca) => {
    expect(classificarOrigem(origem)).toBe(peca);
  });

  it.each(["assinar:criar-assinatura", "orders:cancelado-pago", "provisionamento", "qualquer-coisa"])(
    "%s não pertence a peça nenhuma, só ao feed",
    (origem) => {
      expect(classificarOrigem(origem)).toBeNull();
    }
  );
});
