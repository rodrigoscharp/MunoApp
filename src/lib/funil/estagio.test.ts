import { describe, expect, it } from "vitest";
import { estagioDaSessao, estagioDoLead, podeMoverAMao } from "./estagio";

const leadDeCheckout = { origem: "checkout", status: "NEGOCIACAO", tenantId: null };
const leadDaLanding = { origem: "landing", status: "NOVO", tenantId: null };

describe("estagioDoLead", () => {
  it("é CLIENTE quando existe tenant, não importa o resto", () => {
    expect(
      estagioDoLead(
        { ...leadDeCheckout, tenantId: "t1", status: "NOVO" },
        [{ tipo: "ABANDONOU" }]
      )
    ).toBe("CLIENTE");
  });

  it("é ABANDONOU quando o checkout expirou sem pagamento", () => {
    expect(
      estagioDoLead(leadDeCheckout, [
        { tipo: "CHECKOUT_CRIADO" },
        { tipo: "ABANDONOU" },
      ])
    ).toBe("ABANDONOU");
  });

  it("é PAGOU quando pagou e o restaurante ainda não nasceu", () => {
    expect(
      estagioDoLead(leadDeCheckout, [{ tipo: "CHECKOUT_CRIADO" }, { tipo: "PAGOU" }])
    ).toBe("PAGOU");
  });

  it("é CHECKOUT com a inscrição criada e nenhum pagamento", () => {
    expect(estagioDoLead(leadDeCheckout, [{ tipo: "CHECKOUT_CRIADO" }])).toBe(
      "CHECKOUT"
    );
  });

  // A ordem em que os eventos chegam não pode mandar no estágio: o webhook do
  // Asaas reentrega, e um PAGOU pode ser gravado depois de um CHECKOUT_PASSO
  // que ficou na fila do navegador.
  it("não depende da ordem dos eventos", () => {
    expect(
      estagioDoLead(leadDeCheckout, [
        { tipo: "PAGOU" },
        { tipo: "CHECKOUT_PASSO" },
        { tipo: "CHECKOUT_CRIADO" },
      ])
    ).toBe("PAGOU");
  });

  // Lead sem evento nenhum ainda é alguém que se identificou: o piso do lead é
  // IDENTIFICOU, nunca VISITANTE. Quem bloqueia cookie cai exatamente aqui.
  it("é IDENTIFICOU para lead sem evento", () => {
    expect(estagioDoLead(leadDaLanding, [])).toBe("IDENTIFICOU");
  });

  it("é PERDIDO quando você marcou perdido à mão", () => {
    expect(
      estagioDoLead({ ...leadDaLanding, status: "PERDIDO" }, [])
    ).toBe("PERDIDO");
  });

  // ABANDONOU vence PERDIDO porque diz mais: os dois são perda, e só um
  // informa a causa.
  it("prefere ABANDONOU a PERDIDO quando os dois valem", () => {
    expect(
      estagioDoLead({ ...leadDeCheckout, status: "PERDIDO" }, [
        { tipo: "ABANDONOU" },
      ])
    ).toBe("ABANDONOU");
  });
});

describe("estagioDaSessao", () => {
  it("é VISITANTE quando a sessão nunca virou lead", () => {
    expect(estagioDaSessao(null, [{ tipo: "VISITA" }, { tipo: "VIU_PRECO" }])).toBe(
      "VISITANTE"
    );
  });

  it("delega para o lead assim que ele existe", () => {
    expect(
      estagioDaSessao(leadDeCheckout, [{ tipo: "VISITA" }, { tipo: "CHECKOUT_CRIADO" }])
    ).toBe("CHECKOUT");
  });
});

describe("podeMoverAMao", () => {
  // O funil de checkout é automático de ponta a ponta. Um botão que sobrescreve
  // o que o servidor derivou só cria divergência entre a tela e o que aconteceu.
  it("é falso para o lead de checkout", () => {
    expect(podeMoverAMao({ origem: "checkout" })).toBe(false);
  });

  // Nenhum evento captura "ela pediu para eu voltar em janeiro".
  it.each(["landing", "manual"])("é verdadeiro para origem %s", (origem) => {
    expect(podeMoverAMao({ origem })).toBe(true);
  });
});
