import { describe, expect, it } from "vitest";
import { planoFromHeaderValue, tenantTemMesaQr } from "./plans";

describe("tenantTemMesaQr", () => {
  it("libera só MEMBRO_MESA_QR", () => {
    expect(tenantTemMesaQr("MEMBRO_MESA_QR")).toBe(true);
    expect(tenantTemMesaQr("MEMBRO")).toBe(false);
  });
});

describe("planoFromHeaderValue", () => {
  it("reconhece MEMBRO_MESA_QR", () => {
    expect(planoFromHeaderValue("MEMBRO_MESA_QR")).toBe("MEMBRO_MESA_QR");
  });

  it.each([null, "", "MEMBRO", "free", "algo-desconhecido"])(
    // Fail-closed: qualquer coisa que não seja exatamente o label do plano
    // pago vira MEMBRO, nunca libera a feature por omissão ou por um enum
    // futuro que este deploy ainda não conhece.
    "cai em MEMBRO para %s",
    (valor) => {
      expect(planoFromHeaderValue(valor)).toBe("MEMBRO");
    }
  );
});
