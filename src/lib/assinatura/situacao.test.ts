import { describe, expect, it } from "vitest";
import { situacaoDoCliente } from "./situacao";

describe("situacaoDoCliente", () => {
  // A razão de a função existir: statusPelaRegua mantém a assinatura ATIVA até
  // o sétimo dia de propósito, então ler só o status diria "em dia" durante os
  // seis primeiros dias de atraso, que é justamente a janela em que um
  // telefonema ainda resolve.
  it("mostra atraso antes de o status mudar", () => {
    expect(
      situacaoDoCliente({ temAssinatura: true, status: "ATIVA", diasDeAtraso: 3 })
    ).toEqual({ texto: "em atraso", tom: "atencao" });
  });

  it("é em dia sem cobrança vencida", () => {
    expect(
      situacaoDoCliente({ temAssinatura: true, status: "ATIVA", diasDeAtraso: 0 })
    ).toEqual({ texto: "em dia", tom: "ok" });
  });

  // Sem mensalidade não é inadimplência: é um cliente que existe e cujo valor
  // ninguém cadastrou. Pintar os dois de vermelho treina o olho a ignorar os
  // dois.
  it("separa 'sem mensalidade' de inadimplência", () => {
    expect(situacaoDoCliente({ temAssinatura: false })).toEqual({
      texto: "sem mensalidade",
      tom: "neutro",
    });
  });

  it.each([
    ["BLOQUEADA", "bloqueada", "alerta"],
    ["INADIMPLENTE", "inadimplente", "alerta"],
    ["CANCELADA", "cancelada", "neutro"],
  ] as const)("status %s vira %s", (status, texto, tom) => {
    expect(
      situacaoDoCliente({ temAssinatura: true, status, diasDeAtraso: 40 })
    ).toEqual({ texto, tom });
  });

  it("mostra cortesia enquanto a cobrança não começou", () => {
    expect(
      situacaoDoCliente({ temAssinatura: true, status: "ATIVA", emCortesia: true })
    ).toEqual({ texto: "em cortesia", tom: "neutro" });
  });

  // Cortesia com bloqueio é estado contraditório, e nesse caso o bloqueio é o
  // que a pessoa precisa enxergar.
  it("o bloqueio vence a cortesia", () => {
    expect(
      situacaoDoCliente({
        temAssinatura: true,
        status: "BLOQUEADA",
        emCortesia: true,
      }).texto
    ).toBe("bloqueada");
  });
});
