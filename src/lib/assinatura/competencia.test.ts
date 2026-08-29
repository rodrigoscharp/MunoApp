import { describe, expect, it } from "vitest";
import {
  DIA_VENCIMENTO_MAX,
  competenciaDe,
  proximoVencimento,
  vencimentoDaCompetencia,
} from "./competencia";

describe("competenciaDe", () => {
  it("formata como YYYY-MM com mês de dois dígitos", () => {
    expect(competenciaDe(new Date("2026-08-20T12:00:00Z"))).toBe("2026-08");
    expect(competenciaDe(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
    expect(competenciaDe(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
  });

  it("é estável dentro do mesmo mês", () => {
    // É esta propriedade que o @@unique(assinaturaId, competencia) usa para
    // impedir cobrança duplicada quando o job roda duas vezes no mesmo mês.
    const inicio = competenciaDe(new Date("2026-08-01T00:00:00Z"));
    const fim = competenciaDe(new Date("2026-08-31T23:59:59Z"));
    expect(inicio).toBe(fim);
  });
});

describe("vencimentoDaCompetencia", () => {
  it("monta a data no dia contratado", () => {
    expect(vencimentoDaCompetencia("2026-08", 10).toISOString()).toBe(
      "2026-08-10T00:00:00.000Z"
    );
  });

  it("funciona em fevereiro no teto de 28", () => {
    // O teto de 28 (validado na API desde antes deste projeto) é o que torna
    // desnecessária qualquer regra de fim de mês: não existe mês sem dia 28.
    expect(vencimentoDaCompetencia("2026-02", 28).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z"
    );
  });

  it("recusa dia acima do teto", () => {
    expect(() => vencimentoDaCompetencia("2026-02", 31)).toThrow();
    expect(DIA_VENCIMENTO_MAX).toBe(28);
  });

  it("recusa competência malformada", () => {
    expect(() => vencimentoDaCompetencia("2026/08", 10)).toThrow();
    expect(() => vencimentoDaCompetencia("agosto", 10)).toThrow();
  });
});

describe("proximoVencimento", () => {
  const HOJE = new Date("2026-08-20T12:00:00Z");
  const COBRA_DESDE_ONTEM = {
    diaVencimento: 10,
    inicioCobranca: new Date("2026-01-10T00:00:00Z"),
    ciclo: "MENSAL" as const,
  };

  it("é a cobrança em aberto, mesmo vencida", () => {
    // Fatura atrasada continua sendo o próximo pagamento. Mostrar o mês que
    // vem aqui esconderia a dívida na única tela que existe para exibi-la.
    const vencida = new Date("2026-07-10T00:00:00Z");
    expect(proximoVencimento(COBRA_DESDE_ONTEM, vencida, HOJE)).toBe(vencida);
  });

  it("na cortesia, é o primeiro vencimento contratado", () => {
    const inicioCobranca = new Date("2026-10-10T00:00:00Z");
    expect(
      proximoVencimento(
        { diaVencimento: 10, inicioCobranca, ciclo: "MENSAL" },
        null,
        HOJE
      )
    ).toBe(inicioCobranca);
  });

  it("em dia, com o vencimento do mês já passado, aponta para o mês seguinte", () => {
    expect(
      proximoVencimento(COBRA_DESDE_ONTEM, null, HOJE).toISOString()
    ).toBe("2026-09-10T00:00:00.000Z");
  });

  it("em dia, com o vencimento do mês ainda por vir, aponta para este mês", () => {
    expect(
      proximoVencimento({ ...COBRA_DESDE_ONTEM, diaVencimento: 28 }, null, HOJE)
        .toISOString()
    ).toBe("2026-08-28T00:00:00.000Z");
  });

  it("vira o ano em dezembro", () => {
    const dezembro = new Date("2026-12-20T12:00:00Z");
    expect(
      proximoVencimento(COBRA_DESDE_ONTEM, null, dezembro).toISOString()
    ).toBe("2027-01-10T00:00:00.000Z");
  });
});

describe("proximoVencimento com ciclo anual", () => {
  // Sem isto a tela diz ao cliente do anual que ele paga de novo em 30 dias,
  // quando ele acabou de pagar o ano inteiro.
  it("aponta para daqui a doze meses quando não há cobrança em aberto", () => {
    const agora = new Date("2026-08-26T12:00:00Z");
    const assinatura = {
      diaVencimento: 10,
      inicioCobranca: new Date("2026-08-10T00:00:00Z"),
      ciclo: "ANUAL" as const,
    };

    expect(proximoVencimento(assinatura, null, agora)).toEqual(
      new Date(Date.UTC(2027, 7, 10))
    );
  });

  it("cobrança em aberto continua vindo primeiro, mesmo vencida", () => {
    const agora = new Date("2026-08-26T12:00:00Z");
    const vencida = new Date(Date.UTC(2026, 7, 10));
    const assinatura = {
      diaVencimento: 10,
      inicioCobranca: new Date("2025-08-10T00:00:00Z"),
      ciclo: "ANUAL" as const,
    };

    expect(proximoVencimento(assinatura, vencida, agora)).toEqual(vencida);
  });

  // inicioCobranca de 2024 e agora em 2026: "+1 ano sobre inicioCobranca"
  // devolveria 2025-08-10, uma data passada. O correto é o próximo
  // aniversário do contrato que ainda não chegou.
  it("com dois ciclos completos já passados, aponta para o próximo aniversário do contrato", () => {
    const agora = new Date("2026-08-26T12:00:00Z");
    const assinatura = {
      diaVencimento: 10,
      inicioCobranca: new Date("2024-08-10T00:00:00Z"),
      ciclo: "ANUAL" as const,
    };

    expect(proximoVencimento(assinatura, null, agora)).toEqual(
      new Date(Date.UTC(2027, 7, 10))
    );
  });

  it("antes do aniversário no ano corrente, aponta para este ano, não o seguinte", () => {
    const agora = new Date("2026-06-01T00:00:00Z");
    const assinatura = {
      diaVencimento: 10,
      inicioCobranca: new Date("2024-08-10T00:00:00Z"),
      ciclo: "ANUAL" as const,
    };

    expect(proximoVencimento(assinatura, null, agora)).toEqual(
      new Date(Date.UTC(2026, 7, 10))
    );
  });
});
