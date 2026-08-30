import { describe, expect, it } from "vitest";
import { deveRedirecionar, estaPendente } from "./onboarding";

const estado = (over: Partial<Parameters<typeof estaPendente>[0]> = {}) => ({
  enderecoPreenchido: false,
  temItem: false,
  dispensado: false,
  ...over,
});

describe("estaPendente", () => {
  it("pendente enquanto faltar endereço ou item", () => {
    expect(estaPendente(estado())).toBe(true);
    expect(estaPendente(estado({ enderecoPreenchido: true }))).toBe(true);
    expect(estaPendente(estado({ temItem: true }))).toBe(true);
  });

  it("deixa de ser pendente com os dois prontos", () => {
    expect(estaPendente(estado({ enderecoPreenchido: true, temItem: true }))).toBe(
      false
    );
  });

  // O ponto de derivar em vez de guardar flag: quem preencheu tudo pelo caminho
  // normal do painel, sem passar pelo onboarding, sai de pendente sozinho. Uma
  // flag continuaria dizendo "pendente" com a casa inteira montada.
  it("dispensar não torna pronto", () => {
    expect(estaPendente(estado({ dispensado: true }))).toBe(true);
  });
});

describe("deveRedirecionar", () => {
  // A tabela das quatro combinações da spec. Dispensar desliga o
  // redirecionamento, e só ele: o bloco de progresso do painel continua
  // aparecendo enquanto a casa não estiver montada.
  it("redireciona só quem está pendente e não dispensou", () => {
    expect(deveRedirecionar(estado())).toBe(true);
    expect(deveRedirecionar(estado({ dispensado: true }))).toBe(false);
    expect(
      deveRedirecionar(estado({ enderecoPreenchido: true, temItem: true }))
    ).toBe(false);
    expect(
      deveRedirecionar(
        estado({ enderecoPreenchido: true, temItem: true, dispensado: true })
      )
    ).toBe(false);
  });
});
