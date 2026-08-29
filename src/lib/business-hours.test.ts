/**
 * `checkIsOpen` é o portão do cardápio: dele sai o "Fechado no momento" que
 * impede o cliente de fechar pedido. Errar para o lado fechado é venda perdida
 * sem ninguém perceber; errar para o lado aberto é pedido caindo na cozinha
 * vazia.
 *
 * O horário é o de Brasília (UTC-3), e o relógio é congelado em cada caso para
 * que o teste não dependa da hora em que roda.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  checkIsOpen,
  weekScheduleSchema,
  DEFAULT_SCHEDULE,
  DAY_KEYS,
  type WeekSchedule,
} from "@/lib/business-hours";

afterEach(() => {
  vi.useRealTimers();
});

/** Congela o relógio num horário de Brasília. */
function emBrasilia(iso: string) {
  vi.useFakeTimers();
  // O horário informado é BRT; o relógio do sistema é UTC, três horas à frente.
  vi.setSystemTime(new Date(`${iso}-03:00`));
}

const semana = (dia: string, horario: Partial<WeekSchedule[string]>): WeekSchedule => ({
  ...Object.fromEntries(
    DAY_KEYS.map((d) => [d, { open: false, from: "00:00", to: "00:00" }])
  ),
  [dia]: { open: true, from: "11:00", to: "22:00", ...horario },
});

describe("checkIsOpen", () => {
  // 2026-08-31 é uma segunda-feira.
  it("abre dentro da janela do dia", () => {
    emBrasilia("2026-08-31T12:00:00");
    expect(checkIsOpen(semana("monday", {}))).toBe(true);
  });

  it("fecha antes da abertura", () => {
    emBrasilia("2026-08-31T10:59:00");
    expect(checkIsOpen(semana("monday", {}))).toBe(false);
  });

  it("abre no minuto exato da abertura", () => {
    emBrasilia("2026-08-31T11:00:00");
    expect(checkIsOpen(semana("monday", {}))).toBe(true);
  });

  it("fecha no minuto exato do fechamento", () => {
    // Aberto até 22:00 significa que às 22:00 já fechou — senão o último pedido
    // entra quando a cozinha está desligando.
    emBrasilia("2026-08-31T22:00:00");
    expect(checkIsOpen(semana("monday", {}))).toBe(false);
  });

  it("fecha no dia marcado como fechado, mesmo dentro do horário", () => {
    emBrasilia("2026-08-31T12:00:00");
    const s = semana("monday", {});
    s.monday.open = false;
    expect(checkIsOpen(s)).toBe(false);
  });

  it("usa o dia certo da semana, não o de ontem", () => {
    // Domingo 23:00 BRT já é segunda em UTC. Se o cálculo usasse o dia UTC,
    // o domingo fechado deixaria a segunda aberta uma hora antes da hora.
    emBrasilia("2026-08-30T23:00:00");
    const s = semana("monday", { from: "00:00", to: "23:59" });
    expect(checkIsOpen(s)).toBe(false);
  });

  it("respeita o fuso de Brasília na virada do dia", () => {
    // 2026-09-01T02:00 BRT é 05:00 UTC do mesmo dia (terça).
    emBrasilia("2026-09-01T02:00:00");
    const s = semana("tuesday", { from: "01:00", to: "03:00" });
    expect(checkIsOpen(s)).toBe(true);
  });

  it("fecha quando o dia não existe no schedule gravado", () => {
    emBrasilia("2026-08-31T12:00:00");
    expect(checkIsOpen({} as WeekSchedule)).toBe(false);
  });
});

/**
 * Janela que cruza a meia-noite.
 *
 * Hamburgueria que fecha às 02:00 e pizzaria que fecha "à meia-noite" são o caso
 * comum do delivery, e o formulário do /adm aceita gravar exatamente isso: o
 * schema valida `from` e `to` como HH:MM, sem exigir que `to` seja maior.
 */
describe("checkIsOpen na janela que vira o dia", () => {
  it("continua aberto depois da meia-noite quando o fechamento é 02:00", () => {
    emBrasilia("2026-09-01T01:00:00"); // terça, 01:00
    const s = semana("monday", { from: "18:00", to: "02:00" });
    expect(checkIsOpen(s)).toBe(true);
  });

  it("está aberto antes da meia-noite na janela que vira o dia", () => {
    emBrasilia("2026-08-31T20:00:00"); // segunda, 20:00
    const s = semana("monday", { from: "18:00", to: "02:00" });
    expect(checkIsOpen(s)).toBe(true);
  });

  it("fecha no intervalo morto da janela que vira o dia", () => {
    emBrasilia("2026-08-31T15:00:00"); // segunda, 15:00
    const s = semana("monday", { from: "18:00", to: "02:00" });
    expect(checkIsOpen(s)).toBe(false);
  });

  it("trata 00:00 como fim do dia, não como janela de duração zero", () => {
    emBrasilia("2026-08-31T23:30:00");
    const s = semana("monday", { from: "11:00", to: "00:00" });
    expect(checkIsOpen(s)).toBe(true);
  });
});

describe("weekScheduleSchema", () => {
  it("aceita a semana completa", () => {
    expect(weekScheduleSchema.safeParse(DEFAULT_SCHEDULE).success).toBe(true);
  });

  it("recusa corpo vazio, que apagaria a semana inteira", () => {
    expect(weekScheduleSchema.safeParse({}).success).toBe(false);
  });

  it("recusa semana com um dia faltando", () => {
    const { sunday: _, ...incompleta } = DEFAULT_SCHEDULE;
    expect(weekScheduleSchema.safeParse(incompleta).success).toBe(false);
  });

  it.each(["24:00", "9:00", "11:60", "11h00", ""])(
    "recusa hora malformada (%s)",
    (hora) => {
      const s = { ...DEFAULT_SCHEDULE, monday: { open: true, from: hora, to: "22:00" } };
      expect(weekScheduleSchema.safeParse(s).success).toBe(false);
    }
  );

  it("recusa open que não é booleano", () => {
    const s = { ...DEFAULT_SCHEDULE, monday: { open: "sim", from: "11:00", to: "22:00" } };
    expect(weekScheduleSchema.safeParse(s).success).toBe(false);
  });
});
