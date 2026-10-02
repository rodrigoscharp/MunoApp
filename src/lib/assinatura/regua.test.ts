import { describe, expect, it } from "vitest";
import { diasDeAtraso, diasUteisDeAtraso, situacaoDaCobranca, statusPelaRegua } from "./regua";

const HOJE = new Date("2026-08-20T12:00:00Z");
function diasAtras(n: number): Date {
  return new Date(HOJE.getTime() - n * 24 * 60 * 60 * 1000);
}

describe("diasDeAtraso", () => {
  it("conta dias inteiros, ignorando a hora", () => {
    // Vencimento às 23h de ontem e agora meio-dia de hoje é 1 dia de atraso,
    // não 0,5. Cobrança se conta em dias de calendário, não em frações.
    expect(diasDeAtraso(new Date("2026-08-19T23:00:00Z"), HOJE)).toBe(1);
  });

  it("é zero no próprio dia do vencimento", () => {
    expect(diasDeAtraso(new Date("2026-08-20T01:00:00Z"), HOJE)).toBe(0);
  });

  it("é negativo antes de vencer", () => {
    expect(diasDeAtraso(new Date("2026-08-25T12:00:00Z"), HOJE)).toBe(-5);
  });
});

// HOJE é uma quinta-feira (20/08/2026). Os vencimentos abaixo estão escritos
// como datas, e não como "n dias atrás", porque o que importa aqui é onde caem
// os fins de semana.
describe("diasUteisDeAtraso", () => {
  it("não conta sábado nem domingo", () => {
    // Sexta 07/08 vencida: segunda 10 a quinta 20 são 9 dias úteis.
    expect(diasUteisDeAtraso(new Date("2026-08-07T00:00:00Z"), HOJE)).toBe(9);
  });

  it("vencimento no fim de semana conta a partir da segunda", () => {
    expect(diasUteisDeAtraso(new Date("2026-08-08T00:00:00Z"), HOJE)).toBe(9); // sábado
    expect(diasUteisDeAtraso(new Date("2026-08-09T00:00:00Z"), HOJE)).toBe(9); // domingo
  });

  it("o dia do vencimento não conta, como em diasDeAtraso", () => {
    expect(diasUteisDeAtraso(new Date("2026-08-20T01:00:00Z"), HOJE)).toBe(0);
    expect(diasUteisDeAtraso(new Date("2026-08-19T23:00:00Z"), HOJE)).toBe(1);
  });

  it("fica em zero antes de vencer", () => {
    expect(diasUteisDeAtraso(new Date("2026-08-25T12:00:00Z"), HOJE)).toBe(0);
  });

  it("sobre muitas semanas soma cinco por semana", () => {
    // Quinta 06/08 até quinta 20/08: duas semanas, 10 dias úteis.
    expect(diasUteisDeAtraso(new Date("2026-08-06T00:00:00Z"), HOJE)).toBe(10);
    // 52 semanas exatas: 260 dias úteis.
    expect(diasUteisDeAtraso(new Date("2025-08-21T00:00:00Z"), HOJE)).toBe(260);
  });
});

describe("statusPelaRegua", () => {
  it("sem cobrança vencida, fica ATIVA", () => {
    expect(statusPelaRegua(null, HOJE)).toBe("ATIVA");
  });

  it.each([0, 1, 6])("atraso de %i dias ainda é ATIVA", (dias) => {
    // Atraso curto não marca o cadastro — a tela avisa, o status não muda.
    expect(statusPelaRegua(diasAtras(dias), HOJE)).toBe("ATIVA");
  });

  it.each([7, 8, 12])("atraso de %i dias corridos é INADIMPLENTE", (dias) => {
    expect(statusPelaRegua(diasAtras(dias), HOJE)).toBe("INADIMPLENTE");
  });

  it.each([30, 365])("atraso de %i dias é BLOQUEADA", (dias) => {
    expect(statusPelaRegua(diasAtras(dias), HOJE)).toBe("BLOQUEADA");
  });

  // O combinado com o cliente: o acesso à gestão cai com 10 DIAS ÚTEIS de
  // atraso. O aviso (INADIMPLENTE) continua em 7 dias corridos.
  it("bloqueia com 10 dias úteis de atraso, não antes", () => {
    // 07/08 (sexta): 9 úteis, 13 dias corridos. Ainda INADIMPLENTE.
    expect(statusPelaRegua(new Date("2026-08-07T00:00:00Z"), HOJE)).toBe("INADIMPLENTE");
    // 06/08 (quinta): 10 úteis. BLOQUEADA.
    expect(statusPelaRegua(new Date("2026-08-06T00:00:00Z"), HOJE)).toBe("BLOQUEADA");
  });

  it("os fins de semana adiam o bloqueio: 14 dias corridos podem ainda não ser 10 úteis", () => {
    // Vencimento sábado 08/08: 12 dias corridos, 9 úteis.
    expect(statusPelaRegua(new Date("2026-08-08T00:00:00Z"), HOJE)).toBe("INADIMPLENTE");
  });

  it("as bordas do aviso continuam em dias corridos", () => {
    expect(statusPelaRegua(diasAtras(6), HOJE)).toBe("ATIVA");
    expect(statusPelaRegua(diasAtras(7), HOJE)).toBe("INADIMPLENTE");
  });
});

// Vinha de dentro de src/app/adm/assinatura/page.tsx, onde não tinha como ser
// testada: page.tsx do App Router não aceita export arbitrário. A regra é da
// régua e passou a morar com ela.
describe("situacaoDaCobranca", () => {
  const vencimento = new Date("2026-08-10T00:00:00Z");

  it("cobrança em dia, antes do vencimento, está em aberto", () => {
    expect(
      situacaoDaCobranca(
        { status: "PENDENTE", vencimento },
        new Date("2026-08-05T12:00:00Z")
      )
    ).toBe("EM_ABERTO");
  });

  // O job diário move o status da ASSINATURA, mas não reescreve o status de
  // cada cobrança: uma fatura de 20 dias segue PENDENTE no banco. Mostrar "em
  // aberto" nela seria mentir por omissão, então o rótulo olha a data.
  it("cobrança vencida aparece como vencida mesmo continuando PENDENTE no banco", () => {
    expect(
      situacaoDaCobranca(
        { status: "PENDENTE", vencimento },
        new Date("2026-08-30T12:00:00Z")
      )
    ).toBe("VENCIDA");
  });

  it("no próprio dia do vencimento ainda está em aberto, não vencida", () => {
    expect(
      situacaoDaCobranca(
        { status: "PENDENTE", vencimento },
        new Date("2026-08-10T23:59:00Z")
      )
    ).toBe("EM_ABERTO");
  });

  // A ordem importa: quem pagou com atraso pagou. Ver "Vencida" numa fatura
  // já quitada faria o dono do restaurante ligar achando que deve.
  it("cobrança paga com atraso aparece como paga, nunca como vencida", () => {
    expect(
      situacaoDaCobranca(
        { status: "PAGA", vencimento },
        new Date("2026-09-30T12:00:00Z")
      )
    ).toBe("PAGA");
  });

  it("cobrança cancelada e vencida aparece como cancelada", () => {
    expect(
      situacaoDaCobranca(
        { status: "CANCELADA", vencimento },
        new Date("2026-09-30T12:00:00Z")
      )
    ).toBe("CANCELADA");
  });
});
