import { describe, expect, it } from "vitest";
import { assertMethodAllowed, PaymentMethodNotAllowedError } from "@/lib/payments/method-guard";

describe("assertMethodAllowed", () => {
  it("aceita dinheiro sempre", () => {
    expect(() => assertMethodAllowed("CASH", ["CASH"])).not.toThrow();
  });

  it("recusa PIX quando o tenant não tem gateway ativo", () => {
    expect(() => assertMethodAllowed("PIX", ["CASH"])).toThrow(PaymentMethodNotAllowedError);
  });

  it("recusa cartão quando o tenant não tem gateway ativo", () => {
    expect(() => assertMethodAllowed("CREDIT_CARD", ["CASH"])).toThrow(PaymentMethodNotAllowedError);
  });

  it("aceita PIX quando habilitado", () => {
    expect(() => assertMethodAllowed("PIX", ["PIX", "CREDIT_CARD", "CASH"])).not.toThrow();
  });

  it("recusa método que o gateway conectado não cobre", () => {
    // Um gateway só de PIX não habilita cartão, mesmo estando conectado.
    expect(() => assertMethodAllowed("CREDIT_CARD", ["PIX", "CASH"])).toThrow(
      PaymentMethodNotAllowedError
    );
  });
});
