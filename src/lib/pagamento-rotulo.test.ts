import { describe, expect, it } from "vitest";
import { rotuloDePagamento } from "./pagamento-rotulo";

describe("rotuloDePagamento", () => {
  it.each([
    ["PIX", "UNPAID", "PIX pendente", "pendente"],
    ["CREDIT_CARD", "UNPAID", "Cartão pendente", "pendente"],
    ["CASH", "UNPAID", "Dinheiro", "na-entrega"],
    ["PIX", "PAID", "Pago", "pago"],
    ["CASH", "PAID", "Pago", "pago"],
    ["CREDIT_CARD", "REFUNDED", "Estornado", "neutro"],
  ])("%s + %s → %s", (metodo, situacao, texto, tom) => {
    expect(rotuloDePagamento(metodo, situacao)).toEqual({ texto, tom });
  });

  it("sem situação de pagamento, sem selo", () => {
    expect(rotuloDePagamento("PIX", undefined)).toBeNull();
    expect(rotuloDePagamento(undefined, undefined)).toBeNull();
  });

  it("não pago com método desconhecido, sem selo", () => {
    expect(rotuloDePagamento(undefined, "UNPAID")).toBeNull();
    expect(rotuloDePagamento("BOLETO", "UNPAID")).toBeNull();
  });
});
