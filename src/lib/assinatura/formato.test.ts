import { describe, expect, it } from "vitest";
import {
  formatarCompetencia,
  formatarData,
  formatarInstante,
} from "./formato";

// Vinham de dentro de src/app/adm/assinatura/page.tsx, onde não tinham como
// ser testadas: page.tsx do App Router não aceita export arbitrário.

describe("formatarData", () => {
  // Vencimento é DATA, não instante: o dia 10 é o dia 10 em qualquer lugar.
  // Ler em UTC é o que garante isso — no fuso de Brasília, meia-noite UTC do
  // dia 10 seria 21h do dia 9, e toda fatura apareceria vencendo um dia antes.
  it("lê o vencimento em UTC, para o dia não recuar", () => {
    expect(formatarData(new Date("2026-08-10T00:00:00Z"))).toBe("10/08/2026");
  });

  it("mantém o dia mesmo no fim do dia UTC", () => {
    expect(formatarData(new Date("2026-08-10T23:59:59Z"))).toBe("10/08/2026");
  });

  it("preenche com zero à esquerda", () => {
    expect(formatarData(new Date("2026-01-05T00:00:00Z"))).toBe("05/01/2026");
  });
});

describe("formatarInstante", () => {
  // pagoEm é instante de verdade — a hora em que a baixa entrou. Aqui o fuso
  // é o de Brasília, e é o oposto do caso acima: um pagamento das 22h em São
  // Paulo é 01h do dia seguinte em UTC, e mostrar o dia seguinte faria o
  // cliente jurar que pagou antes.
  it("lê a baixa no fuso de Brasília, não em UTC", () => {
    // 2026-08-11T01:30Z é 2026-08-10 22:30 em São Paulo.
    expect(formatarInstante(new Date("2026-08-11T01:30:00Z"))).toBe("10/08/2026");
  });

  it("os dois formatadores discordam de propósito no mesmo instante", () => {
    const instante = new Date("2026-08-11T01:30:00Z");

    expect(formatarData(instante)).toBe("11/08/2026");
    expect(formatarInstante(instante)).toBe("10/08/2026");
  });
});

describe("formatarCompetencia", () => {
  it("2026-08 vira 08/2026", () => {
    expect(formatarCompetencia("2026-08")).toBe("08/2026");
  });

  // Zero à esquerda preservado: competência é chave, não número.
  it("não come o zero do mês", () => {
    expect(formatarCompetencia("2026-01")).toBe("01/2026");
  });
});
