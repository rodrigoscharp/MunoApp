import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRECOS,
  formatarBRL,
  planoFromHeaderValue,
  tenantTemMesaQr,
} from "./plans";

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

describe("o preço anunciado na landing e o preço do código não podem divergir", () => {
  // A landing é servida de public/vendas/ desde 26/08/2026, mas estar no mesmo
  // repositório não impede a divergência — só a torna detectável. Quem impede é
  // este arquivo.
  //
  // Antes da mudança de casa, index.html dizia "R$ 99,99" e MENSALIDADE_SUGERIDA
  // em ConverterLead.tsx dizia "99". Já divergiam, sem consequência, porque
  // ninguém cobrava automaticamente: o operador lia o número na tela e digitava
  // o que quisesse. No dia em que um gateway emitir a cobrança sozinho, essa
  // divergência vira cobrança com valor diferente do anunciado.
  const landing = readFileSync(
    join(process.cwd(), "public/vendas/index.html"),
    "utf8"
  );

  const precosNaPagina = () => [
    ...landing.matchAll(/R\$\s*((?:\d{1,3}\.)*\d{1,3},\d{2})/g),
  ].map((m) => m[1]);

  it("a página anuncia algum preço — senão as asserções abaixo passam à toa", () => {
    expect(precosNaPagina().length).toBeGreaterThan(0);
  });

  it("cobra os preços de tabela de 2026-08", () => {
    expect(PRECOS.MEMBRO.mensalCentavos).toBe(11999);
    expect(PRECOS.MEMBRO_MESA_QR.mensalCentavos).toBe(14999);
  });

  // Direção 1: plans.ts mudou e o HTML ficou para trás.
  it("o preço mensal do Membro aparece na página", () => {
    expect(precosNaPagina()).toContain(formatarBRL(PRECOS.MEMBRO.mensalCentavos));
  });

  // Direção 2: o HTML mudou e plans.ts ficou para trás — ou alguém digitou um
  // valor que não existe em plano nenhum.
  it("nenhum preço da página é desconhecido do código", () => {
    const conhecidos = Object.values(PRECOS).map((p) =>
      formatarBRL(p.mensalCentavos)
    );

    for (const preco of new Set(precosNaPagina())) {
      expect(conhecidos).toContain(preco);
    }
  });
});
